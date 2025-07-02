import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import { ExtendedLogger } from "../../helpers/logger.js";
import { ApiCallParams, Model, TaskType, PIAPI_MODEL_CONFIG, PiAPIUserError } from "./types/types.js";
import { handleTask } from "./task_handler.js";
import fs from 'fs';
import path from 'path';
import open from 'open';

export const ToolName: string = `piapi_image_to_3d`;

/**
 * Convertit une image locale en Base64
 * @param imagePath Chemin vers l'image locale
 * @returns L'image encodée en Base64
 */
async function imageToBase64(imagePath: string): Promise<string> {
    const imageBuffer = await fs.promises.readFile(imagePath);
    const base64Image = imageBuffer.toString('base64');
    return `data:image/${path.extname(imagePath).slice(1)};base64,${base64Image}`;
}

/**
 * Convertit une image en modèle 3D via l'API PiAPI.ai
 * 
 * @param imageSource URL ou Base64 de l'image à convertir
 * @param seed Seed pour la génération
 * @param ss_sampling_steps Étapes d'échantillonnage SS
 * @param slat_sampling_steps Étapes d'échantillonnage SLAT
 * @param ss_guidance_strength Force du guidage SS
 * @param slat_guidance_strength Force du guidage SLAT
 * @param apiKey Clé API PiAPI.ai
 * @param ignoreSSLErrors Si true, désactive la vérification SSL
 * @param logger Instance du logger
 * @returns Un objet contenant les URLs et informations sur la tâche
 */
async function generateModel(
    imageSource: string,
    seed: number = 0,
    ss_sampling_steps: number = 50,
    slat_sampling_steps: number = 50,
    ss_guidance_strength: number = 7.5,
    slat_guidance_strength: number = 3,
    apiKey: string,
    ignoreSSLErrors: boolean,
    logger: ExtendedLogger
): Promise<{ modelUrl: string; videoUrl: string; imageUrl: string; taskId: string; usage: string; processingTime?: number }> {
    logger.info(`Conversion d'image en 3D`, { seed, ss_sampling_steps, slat_sampling_steps });

    // Obtenir la configuration du modèle Trellis
    const modelConfig = PIAPI_MODEL_CONFIG[Model.QubicoTrellis];
    if (!modelConfig) {
        throw new PiAPIUserError(`Trellis model configuration not found`);
    }

    // Construction du corps de la requête
    const requestData: ApiCallParams = {
        model: Model.QubicoTrellis,
        task_type: TaskType.ImageTo3D,
        input: {
            image: imageSource,
            seed,
            ss_sampling_steps,
            slat_sampling_steps,
            ss_guidance_strength,
            slat_guidance_strength
        }
    };

    // Utiliser le gestionnaire de tâches unifié
    const result = await handleTask(requestData, apiKey, ignoreSSLErrors, logger, modelConfig);
    
    // Vérifier la présence des URLs dans la sortie
    if (!result.output) {
        throw new PiAPIUserError(`TaskId: ${result.taskId}, No output data in completed task`);
    }

    const { model_file, combined_video, no_background_image } = result.output;
    if (!model_file) {
        throw new PiAPIUserError(`TaskId: ${result.taskId}, No model file URL in completed task`);
    }

    return {
        modelUrl: model_file,
        videoUrl: combined_video,
        imageUrl: no_background_image,
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
    const ClientArgsSchema = z.object({
        image_path: z.string().optional().describe("Path to the local image file. Max image size is 1024x1024"),
        image_url: z.string().optional().describe("URL of the input image. Max image size is 1024x1024"),
        seed: z.number().default(0).describe("random seed, default is 0"),
        ss_sampling_steps: z.number().min(10).max(50).default(50)
            .describe("SS sampling steps (10-50, default: 50). Less steps means faster but lower quality"),
        slat_sampling_steps: z.number().min(10).max(50).default(50)
            .describe("SLAT sampling steps (10-50, default: 50). Less steps means faster but lower quality"),
        ss_guidance_strength: z.number().min(0).max(10).default(7.5)
            .describe("SS guidance strength (0-10, default: 7.5)"),
        slat_guidance_strength: z.number().min(0).max(10).default(3)
            .describe("SLAT guidance strength (0-10, default: 3)")
    });

    // Ajout de l'outil au serveur
    server.addTool({
        name: ToolName,
        description: "Converts an image to a 3D model using PiAPI's Trellis model. " +
            "Accepts either a local image file path or an image URL. " +
            "Max image size is 1024x1024 pixels. " +
            "Returns a URL to download the generated 3D model.",
        parameters: ClientArgsSchema,
        execute: async (args) => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil '${ToolName}':`, args);

                try {
                    // Déterminer la source de l'image
                    let imageSource: string;
                    if (args.image_url && args.image_path) {
                        throw new Error('Provide either image_url OR image_path, not both');
                    } else if (!args.image_url && !args.image_path) {
                        throw new Error('Must provide either image_url or image_path');
                    } else if (args.image_url) {
                        imageSource = args.image_url;
                    } else {
                        // Convertir l'image locale en base64
                        const fullPath = config.validatePath(args.image_path!);
                        imageSource = await imageToBase64(fullPath);
                    }

                    const result = await generateModel(
                        imageSource,
                        args.seed,
                        args.ss_sampling_steps,
                        args.slat_sampling_steps,
                        args.ss_guidance_strength,
                        args.slat_guidance_strength,
                        config.PiAPI.ApiKey,
                        config.PiAPI.IgnoreSSLErrors,
                        logger
                    );
                    
                    let contents: { type: "text", text: string }[] = [
                        { type: "text" as const, text: `Task ID: ${result.taskId}` },
                        { type: "text" as const, text: `3D model generated successfully! Usage: ${result.usage} tokens` },
                        { type: "text" as const, text: `Processing time: ${result.processingTime?.toFixed(1) || 'unknown'} seconds` },
                        { type: "text" as const, text: `3D model (.glb) URL: ${result.modelUrl}` },
                        { type: "text" as const, text: `Preview video URL: ${result.videoUrl}` },
                        { type: "text" as const, text: `Background-free image URL: ${result.imageUrl}` }
                    ];

                    // Si OutputDirectory est spécifié, télécharger et sauvegarder le modèle
                    if (config.PiAPI.OuputDirectory) {
                        const outputDir = config.PiAPI.OuputDirectory;
                        
                        // Créer le dossier de sortie s'il n'existe pas
                        if (!fs.existsSync(outputDir)) {
                            fs.mkdirSync(outputDir, { recursive: true });
                        }

                        // Extraire l'extension à partir de l'URL
                        // Téléchargement du modèle 3D
                        const modelUrlParts = result.modelUrl.split('/');
                        const modelFileName = modelUrlParts[modelUrlParts.length - 1];
                        const modelOutputPath = path.join(outputDir, modelFileName);

                        // Téléchargement de la vidéo
                        const videoUrlParts = result.videoUrl.split('/');
                        const videoFileName = videoUrlParts[videoUrlParts.length - 1];
                        const videoOutputPath = path.join(outputDir, videoFileName);

                        // Téléchargement de l'image sans fond
                        const imageUrlParts = result.imageUrl.split('/');
                        const imageFileName = imageUrlParts[imageUrlParts.length - 1];
                        const imageOutputPath = path.join(outputDir, imageFileName);
                        
                        // Télécharger et sauvegarder le modèle 3D
                        const modelResponse = await fetch(result.modelUrl);
                        if (!modelResponse.ok) {
                            throw new Error(`Failed to download 3D model: ${modelResponse.statusText}`);
                        }
                        const modelBuffer = Buffer.from(await modelResponse.arrayBuffer());
                        await fs.promises.writeFile(modelOutputPath, modelBuffer);
                        contents.push({ 
                            type: "text" as const, 
                            text: `3D model (.glb) saved: ${modelOutputPath}` 
                        });

                        // Télécharger et sauvegarder la vidéo
                        const videoResponse = await fetch(result.videoUrl);
                        if (!videoResponse.ok) {
                            throw new Error(`Failed to download preview video: ${videoResponse.statusText}`);
                        }
                        const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
                        await fs.promises.writeFile(videoOutputPath, videoBuffer);
                        contents.push({ 
                            type: "text" as const, 
                            text: `Preview video saved: ${videoOutputPath}` 
                        });

                        // Télécharger et sauvegarder l'image sans fond
                        const imageResponse = await fetch(result.imageUrl);
                        if (!imageResponse.ok) {
                            throw new Error(`Failed to download background-free image: ${imageResponse.statusText}`);
                        }
                        const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
                        await fs.promises.writeFile(imageOutputPath, imageBuffer);
                        contents.push({ 
                            type: "text" as const, 
                            text: `Background-free image saved: ${imageOutputPath}` 
                        });
                    }

                    return { content: contents };
                } catch (error) {
                    logger.error(`Error during 3D model generation:`, error);
                    if (error instanceof PiAPIUserError) {
                        throw error; // Re-throw user errors as-is
                    }
                    throw new Error(`3D model generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            });
        },
    });
}
