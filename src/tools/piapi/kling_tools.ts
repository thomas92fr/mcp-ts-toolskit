import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import { ExtendedLogger } from "../../helpers/logger.js";
import { ApiCallParams, Model, PIAPI_MODEL_CONFIG, PiAPIUserError, KlingOutputSchema } from "./types/types.js";
import { handleTask } from "./task_handler.js";
import fs from 'fs';
import path from 'path';
import open from 'open';

export const ToolName: string = `piapi_kling_tools`;

/**
 * Parse la sortie Kling en utilisant le schéma de validation
 */
function parseKlingOutput(taskId: string, output: unknown): string[] {
    const result = KlingOutputSchema.safeParse(output);

    if (!result.success) {
        throw new PiAPIUserError(
            `TaskId: ${taskId}, Invalid kling output format: ${result.error.message}`
        );
    }

    let urls: string[] = [];
    urls.push(result.data.video_url);
    for (const work of result.data.works) {
        urls.push(work.video.resource_without_watermark);
    }

    if (urls.length === 0) {
        throw new PiAPIUserError(
            `TaskId: ${taskId}, Task completed but no video/work URLs found`
        );
    }

    return urls;
}

/**
 * Génère une vidéo avec Kling
 */
async function generateKlingVideo(
    prompt: string,
    negative_prompt: string,
    referenceImage: string | undefined,
    aspectRatio: string,
    duration: string,
    apiKey: string,
    ignoreSSLErrors: boolean,
    logger: ExtendedLogger
): Promise<{ urls: string[], taskId: string, usage: string, processingTime?: number }> {
    logger.info(`Génération vidéo Kling`, { prompt, aspectRatio, duration });

    // Obtenir la configuration du modèle
    const modelConfig = PIAPI_MODEL_CONFIG[Model.Kling];
    if (!modelConfig) {
        throw new PiAPIUserError(`Unsupported model: ${Model.Kling}`);
    }

    // Construction du corps de la requête
    const requestData: ApiCallParams = {
        model: Model.Kling,
        task_type: "video_generation" as any,
        input: {
            prompt,
            negative_prompt,
            aspect_ratio: aspectRatio,
            image_url: referenceImage,
            duration: duration === "5s" ? 5 : 10
        }
    };

    // Utiliser le gestionnaire de tâches unifié
    const result = await handleTask(requestData, apiKey, ignoreSSLErrors, logger, modelConfig);
    
    // Parser la sortie Kling
    const urls = parseKlingOutput(result.taskId, result.output);
    
    return {
        urls,
        taskId: result.taskId,
        usage: result.usage,
        processingTime: result.processingTime
    };
}

/**
 * Génère un effet vidéo avec Kling
 */
async function generateKlingEffect(
    image: string,
    effectName: string,
    apiKey: string,
    ignoreSSLErrors: boolean,
    logger: ExtendedLogger
): Promise<{ urls: string[], taskId: string, usage: string, processingTime?: number }> {
    logger.info(`Génération effet Kling`, { image, effectName });

    // Obtenir la configuration du modèle
    const modelConfig = PIAPI_MODEL_CONFIG[Model.Kling];
    if (!modelConfig) {
        throw new PiAPIUserError(`Unsupported model: ${Model.Kling}`);
    }

    // Construction du corps de la requête
    const requestData: ApiCallParams = {
        model: Model.Kling,
        task_type: "effects" as any,
        input: {
            image_url: image,
            effect: effectName
        }
    };

    // Utiliser le gestionnaire de tâches unifié
    const result = await handleTask(requestData, apiKey, ignoreSSLErrors, logger, modelConfig);
    
    // Parser la sortie Kling
    const urls = parseKlingOutput(result.taskId, result.output);
    
    return {
        urls,
        taskId: result.taskId,
        usage: result.usage,
        processingTime: result.processingTime
    };
}

/**
 * Ajoute les outils Kling au serveur MCP.
 */
export function Add_Tool(server: FastMCP, config: AppConfig, logger: ExtendedLogger): void {
    
    if (!config.validateTool(ToolName)) return;
        
    if (!config.PiAPI.ApiKey) {
        logger.error("Clé API PiAPI manquante dans la configuration");
        return;
    }

    // Outil Kling Video Generation
    server.addTool({
        name: "piapi_generate_video_kling",
        description: "Generate a video using Kling",
        parameters: z.object({
            prompt: z.string().describe("The prompt to generate a video from"),
            negativePrompt: z.string().optional().default("chaos, bad video, low quality, low resolution").describe("The negative prompt to generate a video from"),
            referenceImage: z.string().url().optional().describe("The reference image to generate a video with"),
            aspectRatio: z.enum(["16:9", "1:1", "9:16"]).optional().default("16:9").describe("The aspect ratio of the video to generate"),
            duration: z.enum(["5s", "10s"]).optional().default("5s").describe("The duration of the video to generate, defaults to 5 seconds"),
        }),
        execute: async (args) => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil 'piapi_generate_video_kling':`, args);

                try {
                    const result = await generateKlingVideo(
                        args.prompt,
                        args.negativePrompt || "chaos, bad video, low quality, low resolution",
                        args.referenceImage,
                        args.aspectRatio,
                        args.duration,
                        config.PiAPI.ApiKey,
                        config.PiAPI.IgnoreSSLErrors,
                        logger
                    );
                    
                    let contents: { type: "text", text: string }[] = [
                        { type: "text", text: `TaskId: ${result.taskId}` },
                        { type: "text", text: `Video generated successfully! Usage: ${result.usage} tokens` },
                        { type: "text", text: `Processing time: ${result.processingTime?.toFixed(1) || 'unknown'} seconds` },
                        { type: "text", text: `Video urls:\n${result.urls.join('\n')}` }
                    ];

                    // Si OutputDirectory est spécifié, télécharger et sauvegarder les vidéos
                    if (config.PiAPI.OuputDirectory) {
                        const outputDir = config.PiAPI.OuputDirectory;
                        
                        if (!fs.existsSync(outputDir)) {
                            fs.mkdirSync(outputDir, { recursive: true });
                        }

                        for (let i = 0; i < result.urls.length; i++) {
                            const videoUrl = result.urls[i];
                            
                            try {
                                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                                const videoFileName = `kling_video_${timestamp}_${i + 1}.mp4`;
                                const videoPath = path.join(outputDir, videoFileName);
                                
                                const videoResponse = await fetch(videoUrl);
                                if (!videoResponse.ok) {
                                    throw new Error(`Failed to download video ${i + 1}: ${videoResponse.statusText}`);
                                }

                                const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
                                await fs.promises.writeFile(videoPath, videoBuffer);

                                contents.push({ 
                                    type: "text", 
                                    text: `Video ${i + 1} saved: ${videoPath}` 
                                });

                                // Ouvrir la première vidéo avec l'application par défaut
                                if (i === 0) {
                                    try {
                                        await open(videoPath);
                                        contents.push({
                                            type: "text",
                                            text: `First video opened with default application`
                                        });
                                    } catch (openError) {
                                        logger.warn(`Unable to open video with default application:`, openError);
                                    }
                                }
                            } catch (downloadError) {
                                logger.error(`Error downloading/saving video ${i + 1}:`, downloadError);
                                const errorMessage = downloadError instanceof Error ? downloadError.message : 'Unknown error';
                                contents.push({
                                    type: "text",
                                    text: `Error saving video ${i + 1}: ${errorMessage}`
                                });
                            }
                        }
                    }

                    return { content: contents };
                } catch (error) {
                    logger.error(`Error during Kling video generation:`, error);
                    throw error;
                }
            });
        },
    });

    // Outil Kling Video Effects
    server.addTool({
        name: "piapi_generate_video_effect_kling",
        description: "Generate a video effect using Kling",
        parameters: z.object({
            image: z.string().url().describe("The reference image to generate a video effect from"),
            effectName: z.enum(["squish", "expansion"]).optional().default("squish").describe("The effect name to generate"),
        }),
        execute: async (args) => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil 'piapi_generate_video_effect_kling':`, args);

                try {
                    const result = await generateKlingEffect(
                        args.image,
                        args.effectName,
                        config.PiAPI.ApiKey,
                        config.PiAPI.IgnoreSSLErrors,
                        logger
                    );
                    
                    let contents: { type: "text", text: string }[] = [
                        { type: "text", text: `TaskId: ${result.taskId}` },
                        { type: "text", text: `Video effect generated successfully! Usage: ${result.usage} tokens` },
                        { type: "text", text: `Processing time: ${result.processingTime?.toFixed(1) || 'unknown'} seconds` },
                        { type: "text", text: `Video urls:\n${result.urls.join('\n')}` }
                    ];

                    // Si OutputDirectory est spécifié, télécharger et sauvegarder les vidéos
                    if (config.PiAPI.OuputDirectory) {
                        const outputDir = config.PiAPI.OuputDirectory;
                        
                        if (!fs.existsSync(outputDir)) {
                            fs.mkdirSync(outputDir, { recursive: true });
                        }

                        for (let i = 0; i < result.urls.length; i++) {
                            const videoUrl = result.urls[i];
                            
                            try {
                                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                                const videoFileName = `kling_effect_${timestamp}_${i + 1}.mp4`;
                                const videoPath = path.join(outputDir, videoFileName);
                                
                                const videoResponse = await fetch(videoUrl);
                                if (!videoResponse.ok) {
                                    throw new Error(`Failed to download video ${i + 1}: ${videoResponse.statusText}`);
                                }

                                const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
                                await fs.promises.writeFile(videoPath, videoBuffer);

                                contents.push({ 
                                    type: "text", 
                                    text: `Video ${i + 1} saved: ${videoPath}` 
                                });

                                // Ouvrir la première vidéo avec l'application par défaut
                                if (i === 0) {
                                    try {
                                        await open(videoPath);
                                        contents.push({
                                            type: "text",
                                            text: `First video opened with default application`
                                        });
                                    } catch (openError) {
                                        logger.warn(`Unable to open video with default application:`, openError);
                                    }
                                }
                            } catch (downloadError) {
                                logger.error(`Error downloading/saving video ${i + 1}:`, downloadError);
                                const errorMessage = downloadError instanceof Error ? downloadError.message : 'Unknown error';
                                contents.push({
                                    type: "text",
                                    text: `Error saving video ${i + 1}: ${errorMessage}`
                                });
                            }
                        }
                    }

                    return { content: contents };
                } catch (error) {
                    logger.error(`Error during Kling effect generation:`, error);
                    throw error;
                }
            });
        },
    });
}
