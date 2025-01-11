import * as winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

export function createLogger(): winston.Logger {
    const customFormat = winston.format.printf(({ level, message, timestamp, stack }) => {
        const levelMap: { [key: string]: string } = {
          error: 'ERR',
          warn: 'WRN',
          info: 'INF',
          debug: 'DBG',
          verbose: 'VRB'
        };
        
        const shortLevel = levelMap[level] || level.substring(0, 3).toUpperCase();
        
        // Si stack trace existe, l'ajouter au message
        return `${timestamp} [${shortLevel}] ${stack || message}`;
      });
          
    
        const transport: DailyRotateFile = new DailyRotateFile({     
            filename: `logs-%DATE%.txt`,
            datePattern: 'YYYY-MM-DD',
            maxSize: '20m',
            maxFiles: '14d'
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