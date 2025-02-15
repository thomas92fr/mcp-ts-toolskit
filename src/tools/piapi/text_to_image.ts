import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import { ExtendedLogger } from "../../helpers/logger.js";
import { ApiCallParams, Model, TaskType, ApiResponse, LoraSetting, ControlNetSetting } from "./types/types.js";
import { stringify } from 'yaml';
import fs from 'fs';
import path from 'path';
import { checkTaskStatus } from './get_task_status.js';
import open from 'open';

export const ToolName: string = `piapi_text_to_image`;

/**
 * Génère une image à partir d'un texte via l'API PiAPI.ai
 * 
 * @param prompt Description textuelle de l'image à générer
 * @param negative_prompt Texte décrivant les éléments à éviter dans l'image
 * @param width Largeur de l'image (optionnel)
 * @param height Hauteur de l'image (optionnel)
 * @param model Modèle à utiliser pour la génération
 * @param apiKey Clé API PiAPI.ai
 * @param ignoreSSLErrors Si true, désactive la vérification SSL
 * @param logger Instance du logger
 * @returns L'URL de l'image générée
 */
async function generateImage(
    prompt: string,
    negative_prompt: string,
    width: number = 1024,
    height: number = 1024,
    model: Model = Model.QubicoFlux1Dev,
    apiKey: string,
    ignoreSSLErrors: boolean,
    logger: ExtendedLogger,
    isFreePlan: boolean,
    lora_settings?: LoraSetting[],
    control_net_settings?: ControlNetSetting[],
    steps?: number,
    guidance_scale?: number
): Promise<string> {
    logger.info(`Génération d'image`, { prompt, width, height, model });

    const url = 'https://api.piapi.ai/api/v1/task';

    // Construction du corps de la requête
    // Construction du corps de la requête avec conditionnels pour version payante
    const requestData: ApiCallParams = {
        model: model,
        task_type: TaskType.Txt2Img,
        input: {
            prompt,
            negative_prompt,
            width,
            height,
            ...(steps !== undefined && { steps }),
            ...(guidance_scale !== undefined && { guidance_scale })
        }
    };

    // Ajout des paramètres de la version payante si applicable
    if (!isFreePlan) {
        if (lora_settings && lora_settings.length > 0) {
            requestData.task_type = TaskType.Txt2ImgLora;
            requestData.input.lora_settings = lora_settings;
        }
        
        if (control_net_settings && control_net_settings.length > 0) {
            requestData.task_type = TaskType.ControlnetLora;
            requestData.input.control_net_settings = control_net_settings;
        }
    }

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
        throw new Error(`PiAPI error: ${response.status} ${response.statusText}\n${errorText}`);
    }

    const result = await response.json() as ApiResponse;
    
    // Vérification de la réponse initiale
    if (result.code !== 200) {
        logger.error(`Erreur lors de la création de la tâche`, result);
        throw new Error(`Task creation failed: ${result.message}`);
    }

    const taskId = result.data.task_id;
    logger.info(`Tâche créée, attente du résultat...\n${stringify(result.data)}`, { taskId });

    // Attendre la complétion de la tâche
    const taskResult = await checkTaskStatus(taskId, apiKey, logger);
    
    // Vérifier la présence de l'URL de l'image
    if (!taskResult.data.output?.image_url) {
        throw new Error('No image URL in completed task');
    }
    
    return taskResult.data.output.image_url;
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
        steps: z.number().min(1).max(50).default(30)
            .describe("Number of sampling steps (1-50). Higher values generally give better quality but take longer"),
        guidance_scale: z.number().min(1.5).max(5).optional()
            .describe("Guidance scale for generation (1.5-5). Higher values improve prompt adherence at the cost of image quality"),

        prompt: z.string().describe("Text description of the image to generate"),
        negative_prompt: z.string().default("low quality, worst quality, low resolution, blurry, text, watermark, signature, bad anatomy, bad proportions, deformed, mutation, extra limbs, extra fingers, fewer fingers, disconnected limbs, distorted face, bad face, poorly drawn face, cloned face, gross proportions, distorted proportions, disfigured, overly rendered, bad art, poorly drawn hands, poorly drawn feet, poorly rendered face, mutation, mutated, extra limbs, extra legs, extra arms, malformed limbs, missing arms, missing legs, floating limbs, disconnected limbs, out of focus, long neck, long body, ugly, duplicate, morbid, mutilated, poorly drawn, bad fingers, cropped")
            .describe("Text description of elements to avoid in the generated image. Used to prevent unwanted features, artifacts, and quality issues. Examples include: low quality, blur, text, watermarks, anatomical errors."),
        width: z.number().min(64).max(1024).default(512)
            .describe("Image width (64-1024, default 512)"),
        height: z.number().min(64).max(1024).default(512)
            .describe("Image height (64-1024, default 512)"),
        model: z.enum([Model.QubicoFlux1Dev, Model.QubicoFlux1DevAdvanced, Model.QubicoFlux1Schnell])
            .default(Model.QubicoFlux1Dev)
            .describe("Model to use for generation. Note: Must be 'Qubico/flux1-dev-advanced' when using LoRA or ControlNet settings")
    });

    // Schéma pour la version gratuite
    const FreeArgsSchema = BaseArgsSchema;

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
    });

    // Sélection du schéma et typage en fonction d'IsFreePlan
    const ClientArgsSchema = config.PiAPI.IsFreePlan ? FreeArgsSchema : PaidArgsSchema;

    // Ajout de l'outil au serveur
    server.addTool({
        name: ToolName,
        description: config.PiAPI.IsFreePlan 
            ? "Generates an image from a text description using PiAPI.ai API. Supports different models and image sizes. The width * height cannot exceed 1048576 pixels."
            : "Generates an image from a text description using PiAPI.ai API. Supports different models, image sizes, LoRA and ControlNet features. The width * height cannot exceed 1048576 pixels.",
        parameters: ClientArgsSchema,
        execute: async (args) => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil '${ToolName}':`, args);

                try {
                    const args_typed = args as ToolArgs;

                    // Vérification de la version du plan si des fonctionnalités payantes sont utilisées
                    if (config.PiAPI.IsFreePlan && isPaidArgs(args_typed)) {
                        throw new Error("LoRA and ControlNet settings are only available in the paid version");
                    }

                    const imageUrl = await generateImage(
                        args_typed.prompt,
                        args_typed.negative_prompt,
                        args_typed.width,
                        args_typed.height,
                        args_typed.model,
                        config.PiAPI.ApiKey,
                        config.PiAPI.IgnoreSSLErrors,
                        logger,
                        config.PiAPI.IsFreePlan,
                        isPaidArgs(args_typed) ? args_typed.lora_settings : undefined,
                        isPaidArgs(args_typed) ? args_typed.control_net_settings : undefined,
                        args_typed.steps,
                        args_typed.guidance_scale
                    );
                    
                    let contents: { type: "text", text: string }[] = [
                        { type: "text" as const, text: `URL de l'image: ${imageUrl}` }
                    ];

                    // Si OutputDirectory est spécifié, télécharger et sauvegarder l'image
                    if (config.PiAPI.OuputDirectory) {
                        const outputDir = config.PiAPI.OuputDirectory;
                        
                        // Créer le dossier de sortie s'il n'existe pas
                        if (!fs.existsSync(outputDir)) {
                            fs.mkdirSync(outputDir, { recursive: true });
                        }

                        // Extraire l'extension à partir de l'URL
                        const urlParts = imageUrl.split('/');
                        const fileName = urlParts[urlParts.length - 1];
                        const outputPath = path.join(outputDir, fileName);

                        // Télécharger l'image
                        const imageResponse = await fetch(imageUrl);
                        if (!imageResponse.ok) {
                            throw new Error(`Failed to download image: ${imageResponse.statusText}`);
                        }

                        // Sauvegarder l'image
                        const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
                        await fs.promises.writeFile(outputPath, imageBuffer);

                        // Ajouter le chemin de l'image sauvegardée à la réponse
                        contents.push({ 
                            type: "text" as const, 
                            text: `Image sauvegardée: ${outputPath}` 
                        });

                        // Ouvrir l'image avec l'application par défaut
                        try {
                            await open(outputPath);
                            contents.push({
                                type: "text" as const,
                                text: `Image ouverte avec l'application par défaut`
                            });
                        } catch (error) {
                            logger.warn(`Impossible d'ouvrir l'image avec l'application par défaut:`, error);
                            contents.push({
                                type: "text" as const,
                                text: `Note: Impossible d'ouvrir l'image automatiquement`
                            });
                        }
                    }

                    return { content: contents };
                } catch (error) {
                    logger.error(`Erreur lors de la génération d'image:`, error);
                    throw error;
                }
            });
        },
    });
}