import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import { ExtendedLogger } from "../../helpers/logger.js";
import { ApiCallParams, Model, TaskType, PIAPI_MODEL_CONFIG, PiAPIUserError } from "./types/types.js";
import { handleTask, parseVideoOutput } from "./task_handler.js";
import fs from 'fs';
import path from 'path';
import open from 'open';

export const ToolName: string = `piapi_video_toolkit`;

/**
 * Enum pour les différents types de tâches du toolkit vidéo
 */
enum VideoToolkitTaskType {
    FaceSwap = "face-swap",
    Upscale = "upscale"
}

/**
 * Traite une vidéo avec le toolkit vidéo PiAPI
 */
async function processVideo(
    taskType: VideoToolkitTaskType,
    params: any,
    apiKey: string,
    ignoreSSLErrors: boolean,
    logger: ExtendedLogger
): Promise<{ url: string, taskId: string, usage: string, processingTime?: number }> {
    logger.info(`Traitement vidéo - ${taskType}`, params);

    // Obtenir la configuration du modèle
    const modelConfig = PIAPI_MODEL_CONFIG[Model.QubicoVideoToolkit];
    if (!modelConfig) {
        throw new PiAPIUserError(`Unsupported model: ${Model.QubicoVideoToolkit}`);
    }

    // Construction du corps de la requête
    const requestData: ApiCallParams = {
        model: Model.QubicoVideoToolkit,
        task_type: taskType as any,
        input: params
    };

    // Utiliser le gestionnaire de tâches unifié
    const result = await handleTask(requestData, apiKey, ignoreSSLErrors, logger, modelConfig);
    
    // Parser la sortie vidéo
    const url = parseVideoOutput(result.taskId, result.output);
    
    return {
        url,
        taskId: result.taskId,
        usage: result.usage,
        processingTime: result.processingTime
    };
}

/**
 * Ajoute les outils du toolkit vidéo au serveur MCP.
 */
export function Add_Tool(server: FastMCP, config: AppConfig, logger: ExtendedLogger): void {
    
    if (!config.validateTool(ToolName)) return;
        
    if (!config.PiAPI.ApiKey) {
        logger.error("Clé API PiAPI manquante dans la configuration");
        return;
    }

    // Outil Video Face Swap
    server.addTool({
        name: "piapi_video_faceswap",
        description: "Faceswap a video",
        parameters: z.object({
            swapImage: z.string().url().describe("The URL of the image to swap"),
            targetVideo: z.string().url().describe("The URL of the video to faceswap"),
        }),
        execute: async (args) => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil 'piapi_video_faceswap':`, args);

                try {
                    const result = await processVideo(
                        VideoToolkitTaskType.FaceSwap,
                        {
                            swap_image: args.swapImage,
                            target_video: args.targetVideo
                        },
                        config.PiAPI.ApiKey,
                        config.PiAPI.IgnoreSSLErrors,
                        logger
                    );
                    
                    let contents: { type: "text", text: string }[] = [
                        { type: "text", text: `TaskId: ${result.taskId}` },
                        { type: "text", text: `Video generated successfully! Usage: ${result.usage} tokens` },
                        { type: "text", text: `Processing time: ${result.processingTime?.toFixed(1) || 'unknown'} seconds` },
                        { type: "text", text: `Video url: ${result.url}` }
                    ];

                    // Si OutputDirectory est spécifié, télécharger et sauvegarder la vidéo
                    if (config.PiAPI.OuputDirectory) {
                        const outputDir = config.PiAPI.OuputDirectory;
                        
                        if (!fs.existsSync(outputDir)) {
                            fs.mkdirSync(outputDir, { recursive: true });
                        }

                        try {
                            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                            const videoFileName = `video_faceswap_${timestamp}.mp4`;
                            const videoPath = path.join(outputDir, videoFileName);
                            
                            const videoResponse = await fetch(result.url);
                            if (!videoResponse.ok) {
                                throw new Error(`Failed to download video: ${videoResponse.statusText}`);
                            }

                            const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
                            await fs.promises.writeFile(videoPath, videoBuffer);

                            contents.push({ 
                                type: "text", 
                                text: `Video saved: ${videoPath}` 
                            });

                            // Ouvrir la vidéo avec l'application par défaut
                            try {
                                await open(videoPath);
                                contents.push({
                                    type: "text",
                                    text: `Video opened with default application`
                                });
                            } catch (openError) {
                                logger.warn(`Unable to open video with default application:`, openError);
                            }
                        } catch (downloadError) {
                            logger.error(`Error downloading/saving video:`, downloadError);
                            const errorMessage = downloadError instanceof Error ? downloadError.message : 'Unknown error';
                            contents.push({
                                type: "text",
                                text: `Error saving video: ${errorMessage}`
                            });
                        }
                    }

                    return { content: contents };
                } catch (error) {
                    logger.error(`Error during video face swap:`, error);
                    throw error;
                }
            });
        },
    });

    // Outil Video Upscale
    server.addTool({
        name: "piapi_video_upscale",
        description: "Upscale video resolution to 2x",
        parameters: z.object({
            video: z.string().url().describe("The URL of the video to upscale"),
        }),
        execute: async (args) => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil 'piapi_video_upscale':`, args);

                try {
                    const result = await processVideo(
                        VideoToolkitTaskType.Upscale,
                        { video: args.video },
                        config.PiAPI.ApiKey,
                        config.PiAPI.IgnoreSSLErrors,
                        logger
                    );
                    
                    let contents: { type: "text", text: string }[] = [
                        { type: "text", text: `TaskId: ${result.taskId}` },
                        { type: "text", text: `Video generated successfully! Usage: ${result.usage} tokens` },
                        { type: "text", text: `Processing time: ${result.processingTime?.toFixed(1) || 'unknown'} seconds` },
                        { type: "text", text: `Video url: ${result.url}` }
                    ];

                    // Si OutputDirectory est spécifié, télécharger et sauvegarder la vidéo
                    if (config.PiAPI.OuputDirectory) {
                        const outputDir = config.PiAPI.OuputDirectory;
                        
                        if (!fs.existsSync(outputDir)) {
                            fs.mkdirSync(outputDir, { recursive: true });
                        }

                        try {
                            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                            const videoFileName = `video_upscaled_${timestamp}.mp4`;
                            const videoPath = path.join(outputDir, videoFileName);
                            
                            const videoResponse = await fetch(result.url);
                            if (!videoResponse.ok) {
                                throw new Error(`Failed to download video: ${videoResponse.statusText}`);
                            }

                            const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
                            await fs.promises.writeFile(videoPath, videoBuffer);

                            contents.push({ 
                                type: "text", 
                                text: `Video saved: ${videoPath}` 
                            });

                            // Ouvrir la vidéo avec l'application par défaut
                            try {
                                await open(videoPath);
                                contents.push({
                                    type: "text",
                                    text: `Video opened with default application`
                                });
                            } catch (openError) {
                                logger.warn(`Unable to open video with default application:`, openError);
                            }
                        } catch (downloadError) {
                            logger.error(`Error downloading/saving video:`, downloadError);
                            const errorMessage = downloadError instanceof Error ? downloadError.message : 'Unknown error';
                            contents.push({
                                type: "text",
                                text: `Error saving video: ${errorMessage}`
                            });
                        }
                    }

                    return { content: contents };
                } catch (error) {
                    logger.error(`Error during video upscaling:`, error);
                    throw error;
                }
            });
        },
    });
}
