import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import { ExtendedLogger } from "../../helpers/logger.js";
import { ApiCallParams, Model, TaskType, LoraSetting, ControlNetSetting, PIAPI_MODEL_CONFIG, PiAPIUserError } from "./types/types.js";
import { handleTask, parseImageOutput } from "./task_handler.js";
import fs from 'fs';
import path from 'path';
import open from 'open';

export const ToolName: string = `piapi_text_to_image`;

/**
 * Génère une image à partir d'un texte via l'API PiAPI.ai
 * 
 * @param prompt Description textuelle de l'image à générer
 * @param negative_prompt Texte décrivant les éléments à éviter dans l'image
 * @param width Largeur de l'image
 * @param height Hauteur de l'image
 * @param model Modèle à utiliser pour la génération
 * @param apiKey Clé API PiAPI.ai
 * @param ignoreSSLErrors Si true, désactive la vérification SSL
 * @param logger Instance du logger
 * @param isFreePlan Si true, limite aux fonctionnalités gratuites
 * @param batch_size Nombre d'images à générer (Schnell uniquement)
 * @param lora_settings Paramètres LoRA (version payante)
 * @param control_net_settings Paramètres ControlNet (version payante)
 * @param steps Nombre d'étapes (auto-calculé si non spécifié)
 * @param guidance_scale Échelle de guidage
 * @returns Les URLs des images générées et informations sur la tâche
 */
async function generateImage(
    prompt: string,
    negative_prompt: string,
    width: number,
    height: number,
    model: Model,
    apiKey: string,
    ignoreSSLErrors: boolean,
    logger: ExtendedLogger,
    isFreePlan: boolean,
    batch_size?: number,
    lora_settings?: LoraSetting[],
    control_net_settings?: ControlNetSetting[],
    steps?: number,
    guidance_scale?: number
): Promise<{ urls: string[], taskId: string, usage: string, processingTime?: number }> {
    logger.info(`Génération d'image`, { prompt, width, height, model, batch_size });

    // Obtenir la configuration du modèle
    const modelConfig = PIAPI_MODEL_CONFIG[model];
    if (!modelConfig) {
        throw new PiAPIUserError(`Unsupported model: ${model}`);
    }

    // Validation batch_size
    if (batch_size && batch_size > 1 && !modelConfig.supportsBatchSize) {
        throw new PiAPIUserError(`batch_size > 1 is only supported for Schnell model`);
    }

    // Calcul automatique des steps si non spécifié
    const finalSteps = steps ? Math.min(steps, modelConfig.maxSteps) : modelConfig.defaultSteps;
    
    // Construction du corps de la requête
    const requestData: ApiCallParams = {
        model: model,
        task_type: TaskType.Txt2Img,
        input: {
            prompt,
            negative_prompt,
            width,
            height,
            steps: finalSteps,
            ...(batch_size && { batch_size }),
            ...(guidance_scale !== undefined && { guidance_scale })
        }
    };

    // Ajout des paramètres de la version payante si applicable
    if (!isFreePlan) {
        if (lora_settings && lora_settings.length > 0) {
            requestData.task_type = TaskType.Txt2ImgLora;
            requestData.input.lora_settings = lora_settings;
            // LoRA nécessite le modèle advanced
            if (model !== Model.QubicoFlux1DevAdvanced) {
                requestData.model = Model.QubicoFlux1DevAdvanced;
                logger.info('Switching to advanced model for LoRA support');
            }
        }
        
        if (control_net_settings && control_net_settings.length > 0) {
            requestData.task_type = TaskType.ControlnetLora;
            requestData.input.control_net_settings = control_net_settings;
            // ControlNet nécessite le modèle advanced
            if (model !== Model.QubicoFlux1DevAdvanced) {
                requestData.model = Model.QubicoFlux1DevAdvanced;
                logger.info('Switching to advanced model for ControlNet support');
            }
        }
    }

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

    interface BaseArgs {
        prompt: string;
        negative_prompt: string;
        width: number;
        height: number;
        model: Model;
        steps?: number;
        guidance_scale?: number;
        batch_size?: number;
    }

    interface PaidArgs extends BaseArgs {
        lora_settings?: LoraSetting[];
        control_net_settings?: ControlNetSetting[];
    }

    // Union type pour supporter les deux cas
    type ToolArgs = BaseArgs | PaidArgs;

    // Helper pour vérifier si nous avons des arguments de la version payante
    function isPaidArgs(args: ToolArgs): args is PaidArgs {
        return 'lora_settings' in args || 'control_net_settings' in args;
    }

    // Schémas de validation
    const BaseArgsSchema = z.object({
        prompt: z.string().describe("Text description of the image to generate"),
        negative_prompt: z.string().default("low quality, worst quality, low resolution, blurry, text, watermark, signature, bad anatomy, bad proportions, deformed, mutation, extra limbs, extra fingers, fewer fingers, disconnected limbs, distorted face, bad face, poorly drawn face, cloned face, gross proportions, distorted proportions, disfigured, overly rendered, bad art, poorly drawn hands, poorly drawn feet, poorly rendered face, mutation, mutated, extra limbs, extra legs, extra arms, malformed limbs, missing arms, missing legs, floating limbs, disconnected limbs, out of focus, long neck, long body, ugly, duplicate, morbid, mutilated, poorly drawn, bad fingers, cropped")
            .describe("Text description of elements to avoid in the generated image. Used to prevent unwanted features, artifacts, and quality issues. Examples include: low quality, blur, text, watermarks, anatomical errors."),
        width: z.number().min(64).max(1024).default(512)
            .describe("Image width (64-1024, default 512)"),
        height: z.number().min(64).max(1024).default(512)
            .describe("Image height (64-1024, default 512)"),
        model: z.enum([Model.QubicoFlux1Dev, Model.QubicoFlux1DevAdvanced, Model.QubicoFlux1Schnell])
            .default(Model.QubicoFlux1Dev)
            .describe("Model to use for generation. Note: Must be 'Qubico/flux1-dev-advanced' when using LoRA or ControlNet settings"),
        steps: z.number().min(1).max(50).optional()
            .describe("Number of sampling steps. Auto-selected based on model if not specified"),
        guidance_scale: z.number().min(1.5).max(5).optional()
            .describe("Guidance scale for generation (1.5-5). Higher values improve prompt adherence at the cost of image quality"),
        batch_size: z.number().min(1).max(4).optional().default(1)
            .describe("Number of images to generate (only for Schnell model)")
    });

    // Schéma pour la version gratuite (avec validation de taille)
    const FreeArgsSchema = BaseArgsSchema.refine(
        (data) => data.width * data.height <= 1048576,
        {
            message: "Width * height cannot exceed 1048576 pixels",
            path: ["width", "height"]
        }
    );

    // Schéma pour la version payante avec les fonctionnalités supplémentaires
    const PaidArgsSchema = BaseArgsSchema.extend({
        lora_settings: z.array(z.object({
            lora_type: z.string().optional().describe("name of the lora model"),
            lora_image: z.string().optional().describe("optional image for LoRA")
        })).optional().describe("Check Flux with LoRA and Controlnet"),
        
        control_net_settings: z.array(z.object({
            control_type: z.string().describe("name of the controlnet model"),
            control_image: z.string().optional().describe("image url of the control image"),
            control_strength: z.number().min(0).max(1).default(0.55).describe("Strength of the control network effect (0-1)"),
            return_preprocessed_image: z.boolean().default(true).describe("Whether to return the preprocessed control image")
        })).optional().describe("Check Flux with LoRA and Controlnet")
    }).refine(
        (data) => data.width * data.height <= 1048576,
        {
            message: "Width * height cannot exceed 1048576 pixels",
            path: ["width", "height"]
        }
    );

    // Sélection du schéma et typage en fonction d'IsFreePlan
    const ClientArgsSchema = config.PiAPI.IsFreePlan ? FreeArgsSchema : PaidArgsSchema;

    // Ajout de l'outil au serveur
    server.addTool({
        name: ToolName,
        description: config.PiAPI.IsFreePlan 
            ? "Generates an image from a text description using PiAPI.ai API. Supports different models and image sizes. Automatically optimizes steps based on model. The width * height cannot exceed 1048576 pixels."
            : "Generates an image from a text description using PiAPI.ai API. Supports different models, image sizes, LoRA and ControlNet features. Automatically optimizes steps based on model and supports batch generation for Schnell. The width * height cannot exceed 1048576 pixels.",
        parameters: ClientArgsSchema,
        execute: async (args) => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil '${ToolName}':`, args);

                try {
                    const args_typed = args as ToolArgs;

                    // Vérification de la version du plan si des fonctionnalités payantes sont utilisées
                    if (config.PiAPI.IsFreePlan && isPaidArgs(args_typed)) {
                        throw new PiAPIUserError("LoRA and ControlNet settings are only available in the paid version");
                    }

                    // Validation batch_size pour modèle Schnell uniquement
                    if (args_typed.batch_size && args_typed.batch_size > 1 && args_typed.model !== Model.QubicoFlux1Schnell) {
                        throw new PiAPIUserError("batch_size > 1 is only supported for Schnell model");
                    }

                    const result = await generateImage(
                        args_typed.prompt,
                        args_typed.negative_prompt,
                        args_typed.width,
                        args_typed.height,
                        args_typed.model,
                        config.PiAPI.ApiKey,
                        config.PiAPI.IgnoreSSLErrors,
                        logger,
                        config.PiAPI.IsFreePlan,
                        args_typed.batch_size,
                        isPaidArgs(args_typed) ? args_typed.lora_settings : undefined,
                        isPaidArgs(args_typed) ? args_typed.control_net_settings : undefined,
                        args_typed.steps,
                        args_typed.guidance_scale
                    );
                    
                    let contents: { type: "text", text: string }[] = [
                        { type: "text" as const, text: `Task ID: ${result.taskId}` },
                        { type: "text" as const, text: `Images generated successfully! Usage: ${result.usage} tokens` },
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
                                // Extraire l'extension à partir de l'URL ou utiliser .png par défaut
                                const urlParts = imageUrl.split('/');
                                const fileName = urlParts[urlParts.length - 1] || `image_${result.taskId}_${i + 1}.png`;
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
                    logger.error(`Error during image generation:`, error);
                    if (error instanceof PiAPIUserError) {
                        throw error; // Re-throw user errors as-is
                    }
                    throw new Error(`Image generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            });
        },
    });
}