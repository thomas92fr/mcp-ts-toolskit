import * as winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { AppConfig } from '../models/appConfig.js';
import path from "path";

export function createLogger(config : AppConfig): winston.Logger {
          const customFormat = winston.format.printf(({ level, message, timestamp, stack, ...meta }) => {
            const levelMap: { [key: string]: string } = {
                error: 'ERR',
                warn: 'WRN',
                info: 'INF',
                debug: 'DBG',
                verbose: 'VRB'
            };
            
            const shortLevel = levelMap[level] || level.substring(0, 3).toUpperCase();
            
            // Construction du message avec meta
            let logMessage = `${timestamp} [${shortLevel}] ${stack || message}`;
            
            // Ajout des meta s'ils existent
            if (Object.keys(meta).length > 0) {
                logMessage += ` | meta: ${JSON.stringify(meta)}`;
            }
            
            return logMessage;
        });
          
    
        const transport: DailyRotateFile = new DailyRotateFile({     
          filename: path.join(config.basePath,'app-logs-%DATE%.txt'),
            datePattern: 'YYYY-MM-DD',
            maxFiles: '7d'
        });
    
        const logger = winston.createLogger({
            format: winston.format.combine(
              winston.format.timestamp({
                format: 'YYYY-MM-DD HH:mm:ss.SSS Z' // Format avec timezone
              }),
              winston.format.errors({ stack: true }), // Ajoute la stack trace
              customFormat
            ),
            transports: [
                transport
            ]
          });

    return logger;
          
}