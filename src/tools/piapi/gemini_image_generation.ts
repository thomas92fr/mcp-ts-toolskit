import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import { ExtendedLogger } from "../../helpers/logger.js";
import { ApiCallParams, Model, TaskType, PIAPI_MODEL_CONFIG, PiAPIUserError } from "./types/types.js";
import { handleTask, parseImageOutput } from "./task_handler.js";
import fs from 'fs';
import path from 'path';
import open from 'open';

export const ToolName: string = `piapi_gemini_image_generation`;

/**
 * Génère une image à partir d'un texte avec Gemini 2.5 Flash Image via l'API PiAPI.ai
 * 
 * @param prompt Description textuelle de l'image à générer
 * @param num_images Nombre d'images à générer (1-4)
 * @param output_format Format de sortie (jpeg ou png)
 * @param image_urls URLs d'images d'entrée optionnelles pour l'édition
 * @param apiKey Clé API PiAPI.ai
 * @param ignoreSSLErrors Si true, désactive la vérification SSL
 * @param logger Instance du logger
 * @returns Les URLs des images générées et informations sur la tâche
 */
async function generateGeminiImage(
    prompt: string,
    num_images: number,
    output_format: "jpeg" | "png",
    image_urls: string[] | undefined,
    apiKey: string,
    ignoreSSLErrors: boolean,
    logger: ExtendedLogger
): Promise<{ urls: string[], taskId: string, usage: string, processingTime?: number }> {
    logger.info(`Génération d'image Gemini`, { prompt, num_images, output_format, image_urls_count: image_urls?.length || 0 });

    // Obtenir la configuration du modèle
    const modelConfig = PIAPI_MODEL_CONFIG[Model.Gemini];
    if (!modelConfig) {
        throw new PiAPIUserError(`Unsupported model: ${Model.Gemini}`);
    }

    // Construction du corps de la requête
    const requestData: ApiCallParams = {
        model: Model.Gemini,
        task_type: TaskType.Gemini25FlashImage,
        input: {
            prompt,
            num_images,
            output_format,
            ...(image_urls && image_urls.length > 0 && { image_urls })
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
 * Ajoute l'outil au serveur MCP.
 * 
 * @param server Instance du serveur FastMCP sur laquelle ajouter l'outil
 * @param config Configuration de l'application contenant notamment la clé API
 * @param logger Instance du logger pour tracer les opérations
 */
export function Add_Tool(server: FastMCP, config: AppConfig, logger: ExtendedLogger): void {
    
    //on regarde si l'outil n'est pas interdit
    if (!config.validateTool(ToolName))
        return;
        
    // Vérification de la présence de la clé API
    if (!config.PiAPI.ApiKey) {
        logger.error("Clé API PiAPI manquante dans la configuration");
        return;
    }

    // Schéma de validation pour les arguments
    const ArgsSchema = z.object({
        prompt: z.string().describe("Text description of the image to generate"),
        num_images: z.number().min(1).max(4).default(1)
            .describe("Number of images to generate (1-4, default: 1). Price will be num_images * $0.03"),
        output_format: z.enum(["jpeg", "png"]).default("jpeg")
            .describe("Output format for the generated image (default: jpeg)"),
        image_urls: z.array(z.string().url()).optional()
            .describe("Optional list of URLs of input images for editing. When provided, the model will edit/modify these images based on the prompt instead of generating from scratch")
    });

    // Ajout de l'outil au serveur
    server.addTool({
        name: ToolName,
        description: "Generates images from text descriptions using Google's Gemini 2.5 Flash Image model via PiAPI.ai API. Supports both text-to-image generation and image editing. Can generate 1-4 images in JPEG or PNG format. Cost: $0.03 per image.",
        parameters: ArgsSchema,
        execute: async (args) => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil '${ToolName}':`, args);

                try {
                    const result = await generateGeminiImage(
                        args.prompt,
                        args.num_images,
                        args.output_format,
                        args.image_urls,
                        config.PiAPI.ApiKey,
                        config.PiAPI.IgnoreSSLErrors,
                        logger
                    );
                    
                    let contents: { type: "text", text: string }[] = [
                        { type: "text" as const, text: `Task ID: ${result.taskId}` },
                        { type: "text" as const, text: `Images generated successfully with Gemini 2.5 Flash! Usage: ${result.usage} tokens` },
                        { type: "text" as const, text: `Processing time: ${result.processingTime?.toFixed(1) || 'unknown'} seconds` },
                        { type: "text" as const, text: `Image URLs:\n${result.urls.join('\n')}` }
                    ];

                    // Si OutputDirectory est spécifié, télécharger et sauvegarder les images
                    if (config.PiAPI.OuputDirectory) {
                        const outputDir = config.PiAPI.OuputDirectory;
                        
                        // Créer le dossier de sortie s'il n'existe pas
                        if (!fs.existsSync(outputDir)) {
                            fs.mkdirSync(outputDir, { recursive: true });
                        }

                        for (let i = 0; i < result.urls.length; i++) {
                            const imageUrl = result.urls[i];
                            
                            try {
                                // Extraire l'extension à partir du format spécifié
                                const extension = args.output_format === "png" ? "png" : "jpg";
                                const fileName = `gemini_image_${result.taskId}_${i + 1}.${extension}`;
                                const outputPath = path.join(outputDir, fileName);

                                // Télécharger l'image
                                const imageResponse = await fetch(imageUrl);
                                if (!imageResponse.ok) {
                                    throw new Error(`Failed to download image ${i + 1}: ${imageResponse.statusText}`);
                                }

                                // Sauvegarder l'image
                                const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
                                await fs.promises.writeFile(outputPath, imageBuffer);

                                contents.push({ 
                                    type: "text" as const, 
                                    text: `Image ${i + 1} saved: ${outputPath}` 
                                });

                                // Ouvrir la première image avec l'application par défaut
                                if (i === 0) {
                                    try {
                                        await open(outputPath);
                                        contents.push({
                                            type: "text" as const,
                                            text: `First image opened with default application`
                                        });
                                    } catch (error) {
                                        logger.warn(`Unable to open image with default application:`, error);
                                        contents.push({
                                            type: "text" as const,
                                            text: `Note: Unable to open image automatically`
                                        });
                                    }
                                }
                            } catch (downloadError) {
                                logger.error(`Error downloading/saving image ${i + 1}:`, downloadError);
                                const errorMessage = downloadError instanceof Error ? downloadError.message : 'Unknown error';
                                contents.push({
                                    type: "text" as const,
                                    text: `Error saving image ${i + 1}: ${errorMessage}`
                                });
                            }
                        }
                    }

                    return { content: contents };
                } catch (error) {
                    logger.error(`Error during Gemini image generation:`, error);
                    if (error instanceof PiAPIUserError) {
                        throw error; // Re-throw user errors as-is
                    }
                    throw new Error(`Gemini image generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            });
        },
    });
}