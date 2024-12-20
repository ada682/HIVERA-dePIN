import axios from 'axios';
import fs from 'fs';
import os from 'os';
import { networkInterfaces } from 'os';
import { HttpsProxyAgent } from 'https-proxy-agent';
import chalk from 'chalk';
import winston from 'winston';
import moment from 'moment';

const MOBILE_USER_AGENTS = [
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 13; M2101K6G) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 12; moto g(60)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36'
];

const logger = winston.createLogger({
    level: 'debug',
    format: winston.format.printf(({ level, message, ...metadata }) => {
        const timestamp = moment().format('MM/DD/YY HH:mm:ss');
        const prefix = `[ ${timestamp} WAT ]`;

        let metadataStr = '';
        if (Object.keys(metadata).length) {
            metadataStr = Object.entries(metadata)
                .map(([key, value]) => `[ ${key}: ${value} ]`)
                .join(' ');
        }

        const colors = {
            info: chalk.green,
            warn: chalk.yellow,
            error: chalk.red,
            debug: chalk.blue
        };

        const logTypes = {
            'Contribution Success': chalk.yellow('Contribution Success'),
            'Current Profile Status': chalk.green('Current Profile Status'),
            'Processing account': chalk.magenta('Processing account'),
            'Setting up proxy': chalk.cyan('Setting up proxy'),
            'Authentication Successful': chalk.green('Authentication Successful'),
            'Initiating contribution request': chalk.blue('Initiating contribution request')
        };

        const coloredMessage = logTypes[message] || message;
        
        return `${prefix} [ ${coloredMessage} ] ${metadataStr}`.trim();
    }),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ 
            filename: 'hivera-detailed.log'
        })
    ]
});

class HiveraDepin {
    constructor(config) {
        this.config = config;
        this.baseUrl = 'https://api.hivera.org';
        this.deviceInfo = this.getDeviceInfo(config.proxy);
    }

    parseProxyString(proxyStr) {
        if (!proxyStr) return null;
        const parts = proxyStr.split(':');
        return parts.length === 2 ? { 
            host: parts[0], 
            port: parts[1], 
            type: 'http' 
        } : null;
    }

    getDeviceInfo(proxyConfig) {
        const parsedProxy = this.parseProxyString(proxyConfig);
        return {
            platform: this.detectMobilePlatform(),
            ip: parsedProxy ? parsedProxy.host : this.getLocalIP(),
            userAgent: this.getRandomMobileUserAgent(),
            proxy: parsedProxy
        };
    }

    getRandomMobileUserAgent() {
        return MOBILE_USER_AGENTS[Math.floor(Math.random() * MOBILE_USER_AGENTS.length)];
    }

    detectMobilePlatform() {
        const platforms = ['Android', 'iOS', 'Mobile'];
        return platforms[Math.floor(Math.random() * platforms.length)];
    }

    getLocalIP() {
        const nets = networkInterfaces();
        for (const name of Object.keys(nets)) {
            for (const net of nets[name]) {
                if (net.family === 'IPv4' && !net.internal) {
                    return net.address;
                }
            }
        }
        return '0.0.0.0';
    }

    displayProfile(profile) {
        logger.info('Current Profile Status', {
            balance: `${profile.HIVERA} HIVERA`,
            power: `${profile.POWER}/${profile.POWER_CAPACITY}`,
            powerPercentage: `${((profile.POWER/profile.POWER_CAPACITY) * 100).toFixed(2)}%`
        });
    }

    async authenticate() {
        try {
            const axiosConfig = {
                headers: {
                    'User-Agent': this.deviceInfo.userAgent,
                    'Origin': 'https://app.hivera.org',
                    'Referer': 'https://app.hivera.org/',
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                timeout: 25000
            };

            if (this.deviceInfo.proxy) {
                logger.info('Setting up proxy', {
                    proxyHost: this.deviceInfo.proxy.host,
                    proxyPort: this.deviceInfo.proxy.port
                });

                const proxyUrl = `http://${this.deviceInfo.proxy.host}:${this.deviceInfo.proxy.port}`;
                const httpsAgent = new HttpsProxyAgent(new URL(proxyUrl));
                axiosConfig.httpsAgent = httpsAgent;
                axiosConfig.proxy = false;
            }

            const response = await axios.get(`${this.baseUrl}/auth`, {
                ...axiosConfig,
                params: { auth_data: this.config.authData }
            });

            logger.info('Authentication Successful', {
                userId: response.data.result.telegram_id,
                username: response.data.result.username
            });

            return response.data.result;
        } catch (error) {
            this.handleAuthError(error);
            return null;
        }
    }

    handleAuthError(error) {
        logger.error('Authentication Failed', {
            errorType: error.name,
            errorMessage: error.message,
            responseStatus: error.response?.status || 'No Status',
            responseData: error.response?.data || 'No Response Data'
        });
    }

    async startEarning(maxRetries = 2) {
        let retries = 0;
        while (retries < maxRetries) {
            try {
                const payload = {
                    from_date: Date.now(),
                    quality_connection: 90 + Math.floor(Math.random() * 8),
                    times: 4
                };

                logger.info('Initiating contribution request', { payload });

                const response = await axios.post(
                    `${this.baseUrl}/v2/engine/contribute`, 
                    payload,
                    {
                        headers: {
                            'User-Agent': this.deviceInfo.userAgent,
                            'Origin': 'https://app.hivera.org',
                            'Referer': 'https://app.hivera.org/',
                            'Accept': 'application/json',
                            'Content-Type': 'application/json'
                        },
                        params: { auth_data: this.config.authData },
                        timeout: 25000
                    }
                );

                const result = response.data.result;
                
                logger.info('Contribution Success', {
                    username: this.config.username,
                    newBalance: result.profile.HIVERA,
                    powerStatus: `${result.profile.POWER}/${result.profile.POWER_CAPACITY}`
                });

                this.displayProfile(result.profile);
                return result;

            } catch (error) {
                if (error.response?.data?.error === 'insufficient power') {
                    logger.warn(`Insufficient power for account: ${this.config.username}`);
                    throw new Error('insufficient power');
                }

                logger.error(`Contribution Failed (Attempt ${retries + 1})`, {
                    errorMessage: error.message,
                    errorResponse: error.response?.data || 'No response'
                });
                
                retries++;
                await this.sleep(5000);
            }
        }
        return null;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

class HiveraMultiAccount {
    constructor(configPath = './data.txt') {
        this.configPath = configPath;
        this.accounts = this.loadAccounts();
    }

    loadAccounts() {
        try {
            const data = fs.readFileSync(this.configPath, 'utf8');
            return JSON.parse(data).accounts.map(account => ({
                ...account,
                username: account.username || 'Unknown'
            }));
        } catch (error) {
            logger.error(`Config file error: ${error.message}`);
            return [];
        }
    }

    async runMultiAccount(continuousMode = true) {
        logger.info('Starting Hivera Multi-Account Bot', {
            accountCount: this.accounts.length,
            continuousMode
        });

        while (true) {
            const results = [];
            let hasSuccessfulAccount = false;

            for (const account of this.accounts) {
                logger.info(`Processing account: ${account.username}`);
                
                const hivera = new HiveraDepin({
                    authData: account.authData,
                    proxy: account.proxy,
                    username: account.username
                });

                try {
                    const authResult = await hivera.authenticate();
                    if (!authResult) {
                        results.push({
                            username: account.username,
                            success: false,
                            error: 'Authentication Failed'
                        });
                        continue;
                    }

                    const result = await hivera.startEarning();
                    results.push({
                        username: account.username,
                        success: true
                    });
                    hasSuccessfulAccount = true;
                } catch (error) {
                    const isInsufficientPower = error.message === 'insufficient power';
                    results.push({
                        username: account.username,
                        success: false,
                        error: isInsufficientPower ? 'Insufficient Power' : error.message
                    });
                }
            }

            logger.info('Cycle Results', { results });

            if (!continuousMode) break;

            if (!hasSuccessfulAccount) {
                logger.info('No accounts with sufficient power, waiting 15 minutes...');
                await new Promise(resolve => setTimeout(resolve, 15 * 60 * 1000));
            } else {
                logger.info('Waiting 30 seconds before next cycle...');
                await new Promise(resolve => setTimeout(resolve, 30 * 1000));
            }
        }
    }
}

async function main() {
    logger.info('Initializing Hivera DePIN Bot');
    const multiAccount = new HiveraMultiAccount();
    
    try {
        await multiAccount.runMultiAccount(true);
    } catch (error) {
        logger.error('Critical error occurred', {
            error: error.message,
            stack: error.stack
        });
    }
}

main();