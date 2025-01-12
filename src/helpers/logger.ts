import * as winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { AppConfig } from '../models/appConfig.js';
import path from "path";
import crypto from "crypto";
import { AsyncLocalStorage } from 'async_hooks';

// Création du storage pour le contexte
const asyncLocalStorage = new AsyncLocalStorage<{operationId: string}>();

export function generateGuid(): string {
    return crypto.randomUUID();
}

// Classe étendue du logger Winston
export class ExtendedLogger {
    private logger: winston.Logger;

    constructor(baseLogger: winston.Logger) {
        this.logger = baseLogger;
    }

    private getOperationId(): string {
        const context = asyncLocalStorage.getStore();
        return context?.operationId ?? 'NO_OPERATION_ID';
    }

    /**
    * Exécute une opération dans un nouveau contexte avec un identifiant unique.
    * Cette fonction permet de tracer toutes les opérations de logging qui auront lieu pendant l'exécution de l'opération.
    * Elle génère un nouvel identifiant unique (UUID) et le stocke dans un AsyncLocalStorage qui sera accessible
    * pendant toute la durée de l'exécution, y compris dans les opérations asynchrones.
    * 
    * @template T Le type de retour de l'opération
    * @param operation Une fonction asynchrone à exécuter dans le nouveau contexte
    * @returns Une promesse contenant le résultat de l'opération
    * 
    * @example
    * await logger.withOperationContext(async () => {
    *   logger.info("Début de l'opération");
    *   // Toutes les opérations de log ici auront le même operationId
    *   await someAsyncOperation();
    *   logger.info("Fin de l'opération");
    * });
    */
    async withOperationContext<T>(operation: () => Promise<T>): Promise<T> {
        const operationId = generateGuid();
        return asyncLocalStorage.run({ operationId }, operation);
    }

    info(message: string, meta: any = {}) {
        const operationId = this.getOperationId();
        this.logger.info(`[${operationId}] ${message}`, meta);
    }

    error(message: string, meta: any = {}) {
        const operationId = this.getOperationId();
        this.logger.error(`[${operationId}] ${message}`, meta);
    }

    debug(message: string, meta: any = {}) {
        const operationId = this.getOperationId();
        this.logger.debug(`[${operationId}] ${message}`, meta);
    }

    warn(message: string, meta: any = {}) {
        const operationId = this.getOperationId();
        this.logger.warn(`[${operationId}] ${message}`, meta);
    }
}

/**
* Crée et configure une instance de logger personnalisé.
* Cette fonction initialise un logger basé sur Winston avec une rotation quotidienne des fichiers
* et un format personnalisé incluant les identifiants d'opération.
* 
* @param config La configuration de l'application contenant notamment le chemin de base pour les logs
* @returns Une instance de ExtendedLogger configurée
* 
* Caractéristiques du logger créé :
* - Rotation quotidienne des fichiers logs (conservation sur 7 jours)
* - Format des logs : "timestamp [NIVEAU] [operationId] message | meta"
* - Niveaux de log disponibles : error (ERR), warn (WRN), info (INF), debug (DBG)
* - Support des métadonnées additionnelles
* - Gestion des stack traces pour les erreurs
* 
* @example
* const logger = createLogger(appConfig);
* logger.info("Application démarrée", { version: "1.0.0" });
* // Output: 2024-01-12 10:30:45.123 Z [INF] [550e8400-e29b-41d4-a716-446655440000] Application démarrée | meta: {"version":"1.0.0"}
*/
export function createLogger(config: AppConfig): ExtendedLogger {
    const customFormat = winston.format.printf(({ level, message, timestamp, stack, ...meta }) => {
        const levelMap: { [key: string]: string } = {
            error: 'ERR',
            warn: 'WRN',
            info: 'INF',
            debug: 'DBG',
            verbose: 'VRB'
        };
        
        const shortLevel = levelMap[level] || level.substring(0, 3).toUpperCase();
        
        let logMessage = `${timestamp} [${shortLevel}] ${stack || message}`;
        
        if (Object.keys(meta).length > 0) {
            logMessage += ` | meta: ${JSON.stringify(meta)}`;
        }
        
        return logMessage;
    });
    
    const transport: DailyRotateFile = new DailyRotateFile({     
        filename: path.join(config.BasePath,'app-logs-%DATE%.txt'),
        datePattern: 'YYYY-MM-DD',
        maxFiles: '7d'
    });

    const winstonLogger = winston.createLogger({
        format: winston.format.combine(
            winston.format.timestamp({
                format: 'YYYY-MM-DD HH:mm:ss.SSS Z'
            }),
            winston.format.errors({ stack: true }),
            customFormat
        ),
        transports: [
            transport
        ]
    });

    return new ExtendedLogger(winstonLogger);
}