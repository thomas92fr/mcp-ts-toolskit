import { ExtendedLogger } from "../../helpers/logger.js";
import { ApiCallParams, ApiResponse, PiAPIUserError, ModelConfig, PIAPI_MODEL_CONFIG, ImageOutputSchema, VideoOutputSchema, AudioOutputSchema } from "./types/types.js";
import { checkTaskStatus } from './get_task_status.js';
import { stringify } from 'yaml';

/**
 * Interface pour le résultat d'une tâche complétée
 */
export interface TaskResult {
    taskId: string;
    usage: string;
    output: any;
    processingTime?: number;
}

/**
 * Crée une tâche via l'API PiAPI.ai
 * 
 * @param requestData Données de la requête API
 * @param apiKey Clé API PiAPI.ai
 * @param ignoreSSLErrors Si true, désactive la vérification SSL
 * @param logger Instance du logger
 * @returns L'ID de la tâche créée
 */
async function createTask(
    requestData: ApiCallParams,
    apiKey: string,
    ignoreSSLErrors: boolean,
    logger: ExtendedLogger
): Promise<string> {
    const url = 'https://api.piapi.ai/api/v1/task';

    // Création des options de fetch avec gestion SSL
    const fetchOptions: RequestInit = {
        method: 'POST',
        headers: {
            'X-API-Key': apiKey,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData)
    };

    // Ajout des options SSL si nécessaire
    if (ignoreSSLErrors) {
        logger.info('SSL verification disabled');
        Object.assign(fetchOptions, {
            agent: new (await import('node:https')).Agent({
                rejectUnauthorized: false
            })
        });
    }

    // Exécution de la requête initiale
    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Erreur API PiAPI`, { status: response.status, statusText: response.statusText, error: errorText });
        throw new PiAPIUserError(`PiAPI error: ${response.status} ${response.statusText}\n${errorText}`);
    }

    const result = await response.json() as ApiResponse;
    
    // Vérification de la réponse initiale
    if (result.code !== 200) {
        logger.error(`Erreur lors de la création de la tâche`, result);
        throw new PiAPIUserError(`Task creation failed: ${result.message}`);
    }

    return result.data.task_id;
}

/**
 * Obtient le résultat d'une tâche en attente de sa complétion
 * 
 * @param taskId ID de la tâche
 * @param apiKey Clé API PiAPI.ai
 * @param logger Instance du logger
 * @param maxAttempts Nombre maximum de tentatives
 * @param timeout Timeout total en secondes
 * @returns Le résultat de la tâche
 */
async function getTaskResult(
    taskId: string,
    apiKey: string,
    logger: ExtendedLogger,
    maxAttempts: number,
    timeout: number
): Promise<TaskResult> {
    const startTime = Date.now();
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        logger.info(`Checking task status (attempt ${attempt + 1}/${maxAttempts})...`);

        const statusResponse = await fetch(
            `https://api.piapi.ai/api/v1/task/${taskId}`,
            {
                headers: {
                    'X-API-Key': apiKey,
                },
            }
        );

        const statusData = await statusResponse.json() as ApiResponse;

        if (statusData.code !== 200) {
            throw new PiAPIUserError(
                `TaskId: ${taskId}, Status check failed: ${statusData.message}`
            );
        }

        const { status, output, error } = statusData.data;
        logger.info(`Task status: ${status}`);

        if (status === "completed") {
            if (!output) {
                throw new PiAPIUserError(
                    `TaskId: ${taskId}, Task completed but no output found`
                );
            }
            
            const usage = statusData.data.meta.usage?.consume?.toString() || "unknown";
            const processingTime = (Date.now() - startTime) / 1000;

            return { taskId, usage, output, processingTime };
        }

        if (status === "failed") {
            const errorMessage = error?.message || "Unknown error";
            throw new PiAPIUserError(
                `TaskId: ${taskId}, Generation failed: ${errorMessage}`
            );
        }

        // Attendre avant la prochaine vérification
        const waitTime = Math.min((timeout * 1000) / maxAttempts, 5000); // Max 5 secondes entre tentatives
        await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    throw new PiAPIUserError(
        `TaskId: ${taskId}, Generation timed out after ${timeout} seconds`
    );
}

/**
 * Gère une tâche complète : création + attente du résultat
 * 
 * @param requestData Données de la requête API
 * @param apiKey Clé API PiAPI.ai
 * @param ignoreSSLErrors Si true, désactive la vérification SSL
 * @param logger Instance du logger
 * @param config Configuration du modèle (optionnel, sera déduite du modèle si non fournie)
 * @returns Le résultat de la tâche
 */
export async function handleTask(
    requestData: ApiCallParams,
    apiKey: string,
    ignoreSSLErrors: boolean,
    logger: ExtendedLogger,
    config?: ModelConfig
): Promise<TaskResult> {
    // Utiliser la configuration du modèle si disponible
    const modelConfig = config || PIAPI_MODEL_CONFIG[requestData.model];
    
    if (!modelConfig) {
        logger.warn(`No configuration found for model ${requestData.model}, using defaults`);
        // Valeurs par défaut
        const defaultConfig: ModelConfig = {
            defaultSteps: 25,
            maxSteps: 50,
            maxAttempts: 30,
            timeout: 180
        };
        return handleTaskWithConfig(requestData, apiKey, ignoreSSLErrors, logger, defaultConfig);
    }

    return handleTaskWithConfig(requestData, apiKey, ignoreSSLErrors, logger, modelConfig);
}

/**
 * Gère une tâche avec une configuration spécifique
 */
async function handleTaskWithConfig(
    requestData: ApiCallParams,
    apiKey: string,
    ignoreSSLErrors: boolean,
    logger: ExtendedLogger,
    config: ModelConfig
): Promise<TaskResult> {
    // Créer la tâche
    const taskId = await createTask(requestData, apiKey, ignoreSSLErrors, logger);
    logger.info(`Task created with ID: ${taskId}\n${stringify(requestData)}`);

    // Attendre le résultat
    return await getTaskResult(
        taskId,
        apiKey,
        logger,
        config.maxAttempts,
        config.timeout
    );
}

/**
 * Parse la sortie d'image en utilisant le schéma de validation
 */
export function parseImageOutput(taskId: string, output: unknown): string[] {
    const result = ImageOutputSchema.safeParse(output);

    if (!result.success) {
        throw new PiAPIUserError(
            `TaskId: ${taskId}, Invalid image output format: ${result.error.message}`
        );
    }

    const imageOutput = result.data;
    const imageUrls = [
        ...(imageOutput.image_url ? [imageOutput.image_url] : []),
        ...(imageOutput.image_urls || []),
    ].filter(Boolean);

    if (imageUrls.length === 0) {
        throw new PiAPIUserError(
            `TaskId: ${taskId}, Task completed but no image URLs found`
        );
    }

    return imageUrls;
}

/**
 * Parse la sortie vidéo en utilisant le schéma de validation
 */
export function parseVideoOutput(taskId: string, output: unknown): string {
    const result = VideoOutputSchema.safeParse(output);

    if (!result.success) {
        throw new PiAPIUserError(
            `TaskId: ${taskId}, Invalid video output format: ${result.error.message}`
        );
    }

    const videoUrl = result.data.video_url;

    if (!videoUrl) {
        throw new PiAPIUserError(
            `TaskId: ${taskId}, Task completed but no video URL found`
        );
    }

    return videoUrl;
}

/**
 * Parse la sortie audio en utilisant le schéma de validation
 */
export function parseAudioOutput(taskId: string, output: unknown): string {
    const result = AudioOutputSchema.safeParse(output);

    if (!result.success) {
        throw new PiAPIUserError(
            `TaskId: ${taskId}, Invalid audio output format: ${result.error.message}`
        );
    }

    const audioUrl = result.data.audio_url;

    if (!audioUrl) {
        throw new PiAPIUserError(
            `TaskId: ${taskId}, Task completed but no audio URL found`
        );
    }

    return audioUrl;
}
