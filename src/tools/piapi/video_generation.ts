import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import { ExtendedLogger } from "../../helpers/logger.js";
import { stringify } from 'yaml';
import { checkTaskStatus } from './get_task_status.js';
import fs from 'fs';
import path from 'path';
import open from 'open';

export const ToolName: string = `piapi_video_generation`;

// Énumérations pour les valeurs constantes
enum VideoModel {
    Luma = "luma"
}

enum VideoTaskType {
    Generation = "video_generation",
    Extend = "extend_video"
}

enum KeyFrameType {
    Image = "image",
    Generation  = "generation"
}

enum AspectRatio {
    Ratio_9_16 = "9:16",
    Ratio_3_4 = "3:4",
    Ratio_1_1 = "1:1",
    Ratio_4_3 = "4:3",
    Ratio_16_9 = "16:9",
    Ratio_21_9 = "21:9"
}

enum ModelName {
    RayV1 = "ray-v1",
    RayV2 = "ray-v2"
}

// Types pour les structures de données
interface KeyFrame {
    type: KeyFrameType;
    url?: string;
    id?: string;
}

interface WebhookConfig {
    endpoint: string;
    secret: string;
}

interface VideoConfig {
    webhook_config?: WebhookConfig;
    service_mode?: string;
}

interface VideoGenerationParams {
    model: VideoModel;
    task_type: VideoTaskType;
    input: {
        prompt: string;
        key_frames?: {
            frame0?: KeyFrame;
            frame1?: KeyFrame;
        };
        model_name?: ModelName;
        duration?: number;
        aspect_ratio?: AspectRatio;
    };
    config?: VideoConfig;
}

interface VideoOutput {
    taskId:string;
    videoUrl: string;
    thumbnailUrl: string;
    lastFrameUrl: string;
    rawVideoUrl: string;
}

/**
 * Télécharge et sauvegarde une ressource depuis une URL
 */
async function downloadAndSave(url: string, outputPath: string, logger: ExtendedLogger): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to download resource: ${response.statusText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.promises.writeFile(outputPath, buffer);
    logger.info(`Resource saved to: ${outputPath}`);
}

/**
 * Génère une vidéo via l'API PiAPI.ai
 */
async function generateVideo(
    params: VideoGenerationParams,
    apiKey: string,
    ignoreSSLErrors: boolean,
    logger: ExtendedLogger
): Promise<VideoOutput> {
    logger.info(`Génération de vidéo`, { params });

    const url = 'https://api.piapi.ai/api/v1/task';

    // Création des options de fetch avec gestion SSL
    const fetchOptions: RequestInit = {
        method: 'POST',
        headers: {
            'X-API-Key': apiKey,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(params)
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

    const result = await response.json();
    
    // Vérification de la réponse initiale
    if (result.code !== 200) {
        logger.error(`Erreur lors de la création de la tâche`, result);
        throw new Error(`Task creation failed: ${result.message}`);
    }

    const taskId = result.data.task_id;
    logger.info(`Tâche créée, attente du résultat...\n${stringify(result.data)}`, { taskId });

    // Attendre la complétion de la tâche
    const taskResult = await checkTaskStatus(taskId, apiKey, logger);
    
    // Vérifier la présence des URLs nécessaires
    if (!taskResult.data.output?.video?.url || !taskResult.data.output?.video_raw?.url) {
        throw new Error('Missing video URLs in completed task');
    }

    return {
        taskId: taskId,
        videoUrl: taskResult.data.output.video.url,
        thumbnailUrl: taskResult.data.output.thumbnail?.url,
        lastFrameUrl: taskResult.data.output.last_frame?.url,
        rawVideoUrl: taskResult.data.output.video_raw.url
    };
}

/**
 * Ajoute l'outil au serveur MCP.
 */
export function Add_Tool(server: FastMCP, config: AppConfig, logger: ExtendedLogger): void {
    if (!config.validateTool(ToolName))
        return;
        
    if (!config.PiAPI.ApiKey) {
        logger.error("Clé API PiAPI manquante dans la configuration");
        return;
    }

    // Schéma de validation pour les paramètres de l'outil
    const KeyFrameSchema = z.object({
        type:  z.enum([KeyFrameType.Image, KeyFrameType.Generation]).default(KeyFrameType.Image)
        .describe("Dans une tâche de conversion d'image en vidéo, le type de l'image ne peut être défini que sur image, dans la tâche d'extension vidéo, frame0 doit être défini. Le type doit être 'generation' et l'id doit être l'identifiant de la tâche vidéo originale."),
        url: z.string().url().optional(),
        id: z.string().optional().describe("Dans une tâche d'extension vidéo, frame0 doit être défini. Le type doit être 'generation' et l'id doit être l'identifiant de la tâche vidéo originale.")
    });

    const ToolArgsSchema = z.object({       
        task_type: z.enum([VideoTaskType.Generation, VideoTaskType.Extend]).default(VideoTaskType.Generation)
            .describe("Type de la tâche demandée, génération de vidéo, ou extension d'une vidéo"),
        prompt: z.string().describe("Description textuelle de la vidéo à générer"),
        key_frames: z.object({
            frame0: KeyFrameSchema.optional(),
            frame1: KeyFrameSchema.optional()
        }).optional(),
        model_name: z.enum([ModelName.RayV1, ModelName.RayV2]).default(ModelName.RayV1)
            .describe("Modèle à utiliser (ray-v1 par défaut, ray-v2 uniquement pour txt2video)"),
        duration: z.number().min(5).max(10).default(5)
            .describe("Durée de la vidéo (5-10 secondes)"),
        aspect_ratio: z.enum([
            AspectRatio.Ratio_9_16,
            AspectRatio.Ratio_3_4,
            AspectRatio.Ratio_1_1,
            AspectRatio.Ratio_4_3,
            AspectRatio.Ratio_16_9,
            AspectRatio.Ratio_21_9
        ]).default(AspectRatio.Ratio_16_9)
            .describe("Ratio d'aspect de la vidéo"),
        webhook_config: z.object({
            endpoint: z.string(),
            secret: z.string()
        }).optional()
            .describe("Configuration webhook pour les notifications")
    });

    // Ajout de l'outil au serveur
    server.addTool({
        name: ToolName,
        description: "Génère une vidéo à partir d'un texte descriptif et optionnellement d'images clés via l'API PiAPI.ai",
        parameters: ToolArgsSchema,
        execute: async (args) => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil '${ToolName}':`, args);

                try {
                    const params: VideoGenerationParams = {
                        model: VideoModel.Luma,
                        task_type: args.task_type,
                        input: {
                            prompt: args.prompt,
                            key_frames: args.key_frames,
                            model_name: args.model_name,
                            duration: args.duration,
                            aspect_ratio: args.aspect_ratio
                        }
                    };

                    if (args.webhook_config) {
                        params.config = {
                            webhook_config: args.webhook_config
                        };
                    }

                    const videoOutput = await generateVideo(
                        params,
                        config.PiAPI.ApiKey,
                        config.PiAPI.IgnoreSSLErrors,
                        logger
                    );
                    
                    let contents: { type: "text", text: string }[] = [
                        { type: "text", text: `Id de la tâche: ${videoOutput.taskId}` },
                        { type: "text", text: `URL de la vidéo: ${videoOutput.videoUrl}` },
                        { type: "text", text: `URL de la vidéo raw: ${videoOutput.rawVideoUrl}` }
                    ];

                    if (videoOutput.thumbnailUrl) {
                        contents.push({ type: "text", text: `URL de la miniature: ${videoOutput.thumbnailUrl}` });
                    }

                    if (videoOutput.lastFrameUrl) {
                        contents.push({ type: "text", text: `URL de la dernière image: ${videoOutput.lastFrameUrl}` });
                    }

                    // Si OutputDirectory est spécifié, télécharger et sauvegarder les ressources
                    if (config.PiAPI.OuputDirectory) {
                        const outputDir = config.PiAPI.OuputDirectory;
                        
                        // Créer le dossier de sortie s'il n'existe pas
                        if (!fs.existsSync(outputDir)) {
                            fs.mkdirSync(outputDir, { recursive: true });
                        }

                        // Générer des noms de fichiers uniques basés sur la date
                        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                        
                        // Sauvegarder la vidéo raw
                        const videoFileName = `video_${timestamp}.mp4`;
                        const videoPath = path.join(outputDir, videoFileName);
                        await downloadAndSave(videoOutput.rawVideoUrl, videoPath, logger);
                        contents.push({ type: "text", text: `Vidéo sauvegardée: ${videoPath}` });

                        // Sauvegarder la miniature si disponible
                        if (videoOutput.thumbnailUrl) {
                            const thumbFileName = `thumbnail_${timestamp}.jpg`;
                            const thumbPath = path.join(outputDir, thumbFileName);
                            await downloadAndSave(videoOutput.thumbnailUrl, thumbPath, logger);
                            contents.push({ type: "text", text: `Miniature sauvegardée: ${thumbPath}` });
                        }

                        // Sauvegarder la dernière image si disponible
                        if (videoOutput.lastFrameUrl) {
                            const lastFrameFileName = `last_frame_${timestamp}.jpg`;
                            const lastFramePath = path.join(outputDir, lastFrameFileName);
                            await downloadAndSave(videoOutput.lastFrameUrl, lastFramePath, logger);
                            contents.push({ type: "text", text: `Dernière image sauvegardée: ${lastFramePath}` });
                        }

                        // Ouvrir la vidéo avec l'application par défaut
                        try {
                            await open(videoPath);
                            contents.push({
                                type: "text",
                                text: `Vidéo ouverte avec l'application par défaut`
                            });
                        } catch (error) {
                            logger.warn(`Impossible d'ouvrir la vidéo avec l'application par défaut:`, error);
                            contents.push({
                                type: "text",
                                text: `Note: Impossible d'ouvrir la vidéo automatiquement`
                            });
                        }
                    }

                    return { content: contents };
                    
                } catch (error) {
                    logger.error(`Erreur lors de la génération de vidéo:`, error);
                    throw error;
                }
            });
        },
    });
}