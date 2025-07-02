import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import { ExtendedLogger } from "../../helpers/logger.js";
import { ApiCallParams, Model, TaskType, PIAPI_MODEL_CONFIG, PiAPIUserError } from "./types/types.js";
import { handleTask, parseImageOutput } from "./task_handler.js";

export const ToolName: string = `piapi_image_toolkit`;

/**
 * Enum pour les différents types de tâches du toolkit d'images
 */
enum ImageToolkitTaskType {
    FaceSwap = "face-swap",
    BackgroundRemove = "background-remove", 
    Segment = "segment",
    Upscale = "upscale"
}

/**
 * Interface pour les paramètres spécifiques au face swap
 */
interface FaceSwapParams {
    swap_image: string;
    target_image: string;
}

/**
 * Interface pour les paramètres de suppression de fond
 */
interface BackgroundRemoveParams {
    image: string;
}

/**
 * Interface pour les paramètres de segmentation
 */
interface SegmentParams {
    image: string;
    prompt: string;
    negative_prompt?: string;
    segment_factor?: number;
}

/**
 * Interface pour les paramètres d'upscaling
 */
interface UpscaleParams {
    image: string;
    scale?: number;
    face_enhance?: boolean;
}

/**
 * Traite une image avec le toolkit d'images PiAPI
 */
async function processImage(
    taskType: ImageToolkitTaskType,
    params: FaceSwapParams | BackgroundRemoveParams | SegmentParams | UpscaleParams,
    apiKey: string,
    ignoreSSLErrors: boolean,
    logger: ExtendedLogger
): Promise<{ urls: string[], taskId: string, usage: string, processingTime?: number }> {
    logger.info(`Traitement d'image - ${taskType}`, params);

    // Obtenir la configuration du modèle
    const modelConfig = PIAPI_MODEL_CONFIG[Model.QubicoImageToolkit];
    if (!modelConfig) {
        throw new PiAPIUserError(`Unsupported model: ${Model.QubicoImageToolkit}`);
    }

    // Construction du corps de la requête
    const requestData: ApiCallParams = {
        model: Model.QubicoImageToolkit,
        task_type: taskType as any,
        input: params
    };

    // Utiliser le gestionnaire de tâches unifié
    const result = await handleTask(requestData, apiKey, ignoreSSLErrors, logger, modelConfig);
    
    // Parser la sortie
    const urls = parseImageOutput(result.taskId, result.output);
    
    return {
        urls,
        taskId: result.taskId,
        usage: result.usage,
        processingTime: result.processingTime
    };
}

/**
 * Ajoute les outils du toolkit d'images au serveur MCP.
 */
export function Add_Tool(server: FastMCP, config: AppConfig, logger: ExtendedLogger): void {
    
    if (!config.validateTool(ToolName)) return;
        
    if (!config.PiAPI.ApiKey) {
        logger.error("Clé API PiAPI manquante dans la configuration");
        return;
    }

    // Outil Face Swap
    server.addTool({
        name: "piapi_image_faceswap",
        description: "Faceswap an image",
        parameters: z.object({
            swapImage: z.string().url().describe("The URL of the image to swap"),
            targetImage: z.string().url().describe("The URL of the target image"),
        }),
        execute: async (args) => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil 'piapi_image_faceswap':`, args);

                try {
                    const result = await processImage(
                        ImageToolkitTaskType.FaceSwap,
                        {
                            swap_image: args.swapImage,
                            target_image: args.targetImage
                        },
                        config.PiAPI.ApiKey,
                        config.PiAPI.IgnoreSSLErrors,
                        logger
                    );
                    
                    let contents: { type: "text", text: string }[] = [
                        { type: "text", text: `TaskId: ${result.taskId}` },
                        { type: "text", text: `Image generated successfully! Usage: ${result.usage} tokens` },
                        { type: "text", text: `Processing time: ${result.processingTime?.toFixed(1) || 'unknown'} seconds` },
                        { type: "text", text: `Image urls:\n${result.urls.join('\n')}` }
                    ];

                    return { content: contents };
                } catch (error) {
                    logger.error(`Error during face swap:`, error);
                    throw error;
                }
            });
        },
    });

    // Outil Background Remove
    server.addTool({
        name: "piapi_image_rmbg",
        description: "Remove the background of an image",
        parameters: z.object({
            image: z.string().url().describe("The URL of the image to remove the background"),
        }),
        execute: async (args) => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil 'piapi_image_rmbg':`, args);

                try {
                    const result = await processImage(
                        ImageToolkitTaskType.BackgroundRemove,
                        { image: args.image },
                        config.PiAPI.ApiKey,
                        config.PiAPI.IgnoreSSLErrors,
                        logger
                    );
                    
                    let contents: { type: "text", text: string }[] = [
                        { type: "text", text: `TaskId: ${result.taskId}` },
                        { type: "text", text: `Image generated successfully! Usage: ${result.usage} tokens` },
                        { type: "text", text: `Processing time: ${result.processingTime?.toFixed(1) || 'unknown'} seconds` },
                        { type: "text", text: `Image urls:\n${result.urls.join('\n')}` }
                    ];

                    return { content: contents };
                } catch (error) {
                    logger.error(`Error during background removal:`, error);
                    throw error;
                }
            });
        },
    });

    // Outil Segment
    server.addTool({
        name: "piapi_image_segment",
        description: "Segment an image",
        parameters: z.object({
            image: z.string().url().describe("The URL of the image to segment"),
            prompt: z.string().describe("The prompt to segment the image"),
            negativePrompt: z.string().optional().describe("The negative prompt to segment the image"),
            segmentFactor: z.number().optional().default(-15).describe("The factor to segment the image"),
        }),
        execute: async (args) => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil 'piapi_image_segment':`, args);

                try {
                    const result = await processImage(
                        ImageToolkitTaskType.Segment,
                        {
                            image: args.image,
                            prompt: args.prompt,
                            negative_prompt: args.negativePrompt,
                            segment_factor: args.segmentFactor
                        },
                        config.PiAPI.ApiKey,
                        config.PiAPI.IgnoreSSLErrors,
                        logger
                    );
                    
                    let contents: { type: "text", text: string }[] = [
                        { type: "text", text: `TaskId: ${result.taskId}` },
                        { type: "text", text: `Image generated successfully! Usage: ${result.usage} tokens` },
                        { type: "text", text: `Processing time: ${result.processingTime?.toFixed(1) || 'unknown'} seconds` },
                        { type: "text", text: `Image urls:\n${result.urls.join('\n')}` }
                    ];

                    return { content: contents };
                } catch (error) {
                    logger.error(`Error during image segmentation:`, error);
                    throw error;
                }
            });
        },
    });

    // Outil Upscale
    server.addTool({
        name: "piapi_image_upscale",
        description: "Upscale an image to a higher resolution",
        parameters: z.object({
            image: z.string().url().describe("The URL of the image to upscale"),
            scale: z.number().min(2).max(10).optional().default(2).describe("The scale of the image to upscale, defaults to 2"),
            faceEnhance: z.boolean().optional().default(false).describe("Whether to enhance the face of the image"),
        }),
        execute: async (args) => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil 'piapi_image_upscale':`, args);

                try {
                    const result = await processImage(
                        ImageToolkitTaskType.Upscale,
                        {
                            image: args.image,
                            scale: args.scale,
                            face_enhance: args.faceEnhance
                        },
                        config.PiAPI.ApiKey,
                        config.PiAPI.IgnoreSSLErrors,
                        logger
                    );
                    
                    let contents: { type: "text", text: string }[] = [
                        { type: "text", text: `TaskId: ${result.taskId}` },
                        { type: "text", text: `Image generated successfully! Usage: ${result.usage} tokens` },
                        { type: "text", text: `Processing time: ${result.processingTime?.toFixed(1) || 'unknown'} seconds` },
                        { type: "text", text: `Image urls:\n${result.urls.join('\n')}` }
                    ];

                    return { content: contents };
                } catch (error) {
                    logger.error(`Error during image upscaling:`, error);
                    throw error;
                }
            });
        },
    });
}
