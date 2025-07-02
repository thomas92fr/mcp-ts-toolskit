import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import { ExtendedLogger } from "../../helpers/logger.js";
import { ApiCallParams, Model, PIAPI_MODEL_CONFIG, PiAPIUserError } from "./types/types.js";
import { handleTask, parseImageOutput } from "./task_handler.js";
import fs from 'fs';
import path from 'path';
import open from 'open';

export const ToolName: string = `piapi_midjourney_tools`;

/**
 * Génère une image avec Midjourney
 */
async function generateMidjourneyImage(
    prompt: string,
    aspectRatio: string | undefined,
    apiKey: string,
    ignoreSSLErrors: boolean,
    logger: ExtendedLogger
): Promise<{ urls: string[], taskId: string, usage: string, processingTime?: number }> {
    logger.info(`Génération Midjourney`, { prompt, aspectRatio });

    // Obtenir la configuration du modèle
    const modelConfig = PIAPI_MODEL_CONFIG[Model.Midjourney];
    if (!modelConfig) {
        throw new PiAPIUserError(`Unsupported model: ${Model.Midjourney}`);
    }

    // Construction du corps de la requête
    const requestData: ApiCallParams = {
        model: Model.Midjourney,
        task_type: "imagine" as any,
        input: {
            prompt,
            aspect_ratio: aspectRatio,
            process_mode: "fast"
        }
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
 * Ajoute les outils Midjourney au serveur MCP.
 */
export function Add_Tool(server: FastMCP, config: AppConfig, logger: ExtendedLogger): void {
    
    if (!config.validateTool(ToolName)) return;
        
    if (!config.PiAPI.ApiKey) {
        logger.error("Clé API PiAPI manquante dans la configuration");
        return;
    }

    // Outil Midjourney Imagine
    server.addTool({
        name: "piapi_midjourney_imagine",
        description: "Generate a image using Midjourney Imagine",
        parameters: z.object({
            prompt: z.string().describe("The prompt to generate a image from"),
            aspectRatio: z.string().optional().describe("The aspect ratio of the image"),
        }),
        execute: async (args) => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil 'piapi_midjourney_imagine':`, args);

                try {
                    const result = await generateMidjourneyImage(
                        args.prompt,
                        args.aspectRatio,
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

                    // Si OutputDirectory est spécifié, télécharger et sauvegarder les images
                    if (config.PiAPI.OuputDirectory) {
                        const outputDir = config.PiAPI.OuputDirectory;
                        
                        if (!fs.existsSync(outputDir)) {
                            fs.mkdirSync(outputDir, { recursive: true });
                        }

                        for (let i = 0; i < result.urls.length; i++) {
                            const imageUrl = result.urls[i];
                            
                            try {
                                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                                const imageFileName = `midjourney_${timestamp}_${i + 1}.png`;
                                const imagePath = path.join(outputDir, imageFileName);
                                
                                const imageResponse = await fetch(imageUrl);
                                if (!imageResponse.ok) {
                                    throw new Error(`Failed to download image ${i + 1}: ${imageResponse.statusText}`);
                                }

                                const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
                                await fs.promises.writeFile(imagePath, imageBuffer);

                                contents.push({ 
                                    type: "text", 
                                    text: `Image ${i + 1} saved: ${imagePath}` 
                                });

                                // Ouvrir la première image avec l'application par défaut
                                if (i === 0) {
                                    try {
                                        await open(imagePath);
                                        contents.push({
                                            type: "text",
                                            text: `First image opened with default application`
                                        });
                                    } catch (openError) {
                                        logger.warn(`Unable to open image with default application:`, openError);
                                    }
                                }
                            } catch (downloadError) {
                                logger.error(`Error downloading/saving image ${i + 1}:`, downloadError);
                                const errorMessage = downloadError instanceof Error ? downloadError.message : 'Unknown error';
                                contents.push({
                                    type: "text",
                                    text: `Error saving image ${i + 1}: ${errorMessage}`
                                });
                            }
                        }
                    }

                    return { content: contents };
                } catch (error) {
                    logger.error(`Error during Midjourney generation:`, error);
                    throw error;
                }
            });
        },
    });
}
