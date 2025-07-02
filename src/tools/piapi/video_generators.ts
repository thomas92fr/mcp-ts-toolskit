import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import { ExtendedLogger } from "../../helpers/logger.js";
import { ApiCallParams, Model, PIAPI_MODEL_CONFIG, PiAPIUserError } from "./types/types.js";
import { handleTask, parseVideoOutput } from "./task_handler.js";
import fs from 'fs';
import path from 'path';
import open from 'open';

export const ToolName: string = `piapi_video_generators`;

/**
 * Enum pour les différents types de tâches vidéo Hunyuan
 */
enum HunyuanTaskType {
    Txt2Video = "txt2video",
    FastTxt2Video = "fast-txt2video",
    Img2VideoConcat = "img2video-concat",
    Img2VideoReplace = "img2video-replace"
}

/**
 * Enum pour les différents types de tâches vidéo Skyreels
 */
enum SkyreelsTaskType {
    Img2Video = "img2video"
}

/**
 * Enum pour les différents types de tâches vidéo Wan
 */
enum WanTaskType {
    Txt2Video1_3B = "txt2video-1.3b",
    Txt2Video14B = "txt2video-14b",
    Img2Video14B = "img2video-14b"
}

/**
 * Génère une vidéo avec différents modèles
 */
async function generateVideoWithModel(
    model: Model,
    taskType: string,
    params: any,
    apiKey: string,
    ignoreSSLErrors: boolean,
    logger: ExtendedLogger
): Promise<{ url: string, taskId: string, usage: string, processingTime?: number }> {
    logger.info(`Génération vidéo - ${model}`, { taskType, params });

    // Obtenir la configuration du modèle
    const modelConfig = PIAPI_MODEL_CONFIG[model];
    if (!modelConfig) {
        throw new PiAPIUserError(`Unsupported model: ${model}`);
    }

    // Construction du corps de la requête
    const requestData: ApiCallParams = {
        model: model,
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
 * Ajoute les outils de génération vidéo au serveur MCP.
 */
export function Add_Tool(server: FastMCP, config: AppConfig, logger: ExtendedLogger): void {
    
    if (!config.validateTool(ToolName)) return;
        
    if (!config.PiAPI.ApiKey) {
        logger.error("Clé API PiAPI manquante dans la configuration");
        return;
    }

    // Outil Hunyuan Video Generation
    server.addTool({
        name: "piapi_generate_video_hunyuan",
        description: "Generate a video using Qubico Hunyuan",
        parameters: z.object({
            prompt: z.string().describe("The prompt to generate a video from"),
            negativePrompt: z.string().optional().default("chaos, bad video, low quality, low resolution").describe("The negative prompt to generate a video from"),
            referenceImage: z.string().url().optional().describe("The reference image to generate a video from, must be a valid image url"),
            aspectRatio: z.enum(["16:9", "1:1", "9:16"]).optional().default("16:9").describe("The aspect ratio of the video to generate"),
            model: z.enum(["hunyuan", "fastHunyuan", "hunyuanConcat", "hunyuanReplace"]).optional().default("hunyuan")
                .describe("The model to use for video generation"),
        }),
        execute: async (args) => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil 'piapi_generate_video_hunyuan':`, args);

                try {
                    let taskType: string;
                    let modelToUse = args.model;

                    // Déterminer le type de tâche en fonction du modèle et de l'image de référence
                    if (args.referenceImage && (args.model === "hunyuan" || args.model === "fastHunyuan")) {
                        logger.warn("Reference image is not supported for 'hunyuan' or 'fastHunyuan' model, using 'hunyuanConcat' as default");
                        modelToUse = "hunyuanConcat";
                    }

                    switch (modelToUse) {
                        case "hunyuan":
                            taskType = HunyuanTaskType.Txt2Video;
                            break;
                        case "fastHunyuan":
                            taskType = HunyuanTaskType.FastTxt2Video;
                            break;
                        case "hunyuanConcat":
                            taskType = HunyuanTaskType.Img2VideoConcat;
                            break;
                        case "hunyuanReplace":
                            taskType = HunyuanTaskType.Img2VideoReplace;
                            break;
                        default:
                            taskType = HunyuanTaskType.Txt2Video;
                    }

                    const result = await generateVideoWithModel(
                        Model.QubicoHunyuan,
                        taskType,
                        {
                            image: args.referenceImage,
                            prompt: args.prompt,
                            negative_prompt: args.negativePrompt,
                            aspect_ratio: args.aspectRatio
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

                    return { content: contents };
                } catch (error) {
                    logger.error(`Error during Hunyuan video generation:`, error);
                    throw error;
                }
            });
        },
    });

    // Outil Skyreels Video Generation
    server.addTool({
        name: "piapi_generate_video_skyreels",
        description: "Generate a video using Qubico Skyreels",
        parameters: z.object({
            prompt: z.string().describe("The prompt to generate a video from"),
            negativePrompt: z.string().optional().default("chaos, bad video, low quality, low resolution").describe("The negative prompt to generate a video from"),
            aspectRatio: z.enum(["16:9", "1:1", "9:16"]).optional().default("16:9").describe("The aspect ratio of the video to generate"),
            referenceImage: z.string().url().describe("The reference image to generate a video from, must be a valid image url"),
        }),
        execute: async (args) => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil 'piapi_generate_video_skyreels':`, args);

                try {
                    const result = await generateVideoWithModel(
                        Model.QubicoSkyreels,
                        SkyreelsTaskType.Img2Video,
                        {
                            prompt: args.prompt,
                            negative_prompt: args.negativePrompt,
                            aspect_ratio: args.aspectRatio,
                            image: args.referenceImage
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

                    return { content: contents };
                } catch (error) {
                    logger.error(`Error during Skyreels video generation:`, error);
                    throw error;
                }
            });
        },
    });

    // Outil Wan Video Generation
    server.addTool({
        name: "piapi_generate_video_wan",
        description: "Generate a video using Qubico Wan",
        parameters: z.object({
            prompt: z.string().describe("The prompt to generate a video from"),
            negativePrompt: z.string().optional().default("chaos, bad video, low quality, low resolution").describe("The negative prompt to generate a video from"),
            aspectRatio: z.enum(["16:9", "1:1", "9:16"]).optional().default("16:9").describe("The aspect ratio of the video to generate"),
            referenceImage: z.string().url().optional().describe("The reference image to generate a video from, must be a valid image url, only available for 'wan14b' model"),
            model: z.enum(["wan1_3b", "wan14b"]).optional().default("wan1_3b").describe("The model to use for video generation"),
        }),
        execute: async (args) => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil 'piapi_generate_video_wan':`, args);

                try {
                    let taskType = args.model === "wan1_3b" ? WanTaskType.Txt2Video1_3B : WanTaskType.Txt2Video14B;
                    let modelToUse = args.model;
                    
                    if (args.referenceImage) {
                        modelToUse = "wan14b";
                        taskType = WanTaskType.Img2Video14B;
                    }

                    const result = await generateVideoWithModel(
                        Model.QubicoWanx,
                        taskType,
                        {
                            prompt: args.prompt,
                            negative_prompt: args.negativePrompt,
                            aspect_ratio: args.aspectRatio,
                            image: args.referenceImage
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

                    return { content: contents };
                } catch (error) {
                    logger.error(`Error during Wan video generation:`, error);
                    throw error;
                }
            });
        },
    });
}
