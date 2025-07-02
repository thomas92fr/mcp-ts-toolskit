import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import { ExtendedLogger } from "../../helpers/logger.js";
import { ApiCallParams, Model, PIAPI_MODEL_CONFIG, PiAPIUserError, SunoMusicOutputSchema, LumaOutputSchema } from "./types/types.js";
import { handleTask } from "./task_handler.js";
import fs from 'fs';
import path from 'path';
import open from 'open';

export const ToolName: string = `piapi_suno_luma_tools`;

/**
 * Interface pour le résultat d'une génération Luma
 */
interface LumaResult {
    url: string;
    width: number;
    height: number;
}

/**
 * Interface pour un clip musical Suno
 */
interface SunoMusicClip {
    audio_url: string;
    image_url: string;
}

/**
 * Parse la sortie Suno en utilisant le schéma de validation
 */
function parseSunoMusicOutput(taskId: string, output: unknown): SunoMusicClip[] {
    const result = SunoMusicOutputSchema.safeParse(output);

    if (!result.success) {
        throw new PiAPIUserError(
            `TaskId: ${taskId}, Invalid suno music output format: ${result.error.message}`
        );
    }

    const results: SunoMusicClip[] = [];
    for (const [key, value] of Object.entries(result.data.clips)) {
        results.push({
            audio_url: value.audio_url,
            image_url: value.image_url,
        });
    }

    if (results.length === 0) {
        throw new PiAPIUserError(
            `TaskId: ${taskId}, Task completed but no audio/image URLs found`
        );
    }

    return results;
}

/**
 * Parse la sortie Luma en utilisant le schéma de validation
 */
function parseLumaOutput(taskId: string, output: unknown): [LumaResult, LumaResult] {
    const result = LumaOutputSchema.safeParse(output);

    if (!result.success) {
        throw new PiAPIUserError(
            `TaskId: ${taskId}, Invalid luma output format: ${result.error.message}`
        );
    }

    return [result.data.video_raw, result.data.last_frame];
}

/**
 * Génère de la musique avec Suno
 */
async function generateSunoMusic(
    prompt: string,
    makeInstrumental: boolean,
    title: string | undefined,
    tags: string | undefined,
    negativeTags: string | undefined,
    apiKey: string,
    ignoreSSLErrors: boolean,
    logger: ExtendedLogger
): Promise<{ clips: SunoMusicClip[], taskId: string, usage: string, processingTime?: number }> {
    logger.info(`Génération musique Suno`, { prompt, makeInstrumental, title, tags });

    // Obtenir la configuration du modèle
    const modelConfig = PIAPI_MODEL_CONFIG[Model.MusicS];
    if (!modelConfig) {
        throw new PiAPIUserError(`Unsupported model: ${Model.MusicS}`);
    }

    let requestBody: ApiCallParams;
    if (title || tags || negativeTags) {
        if (makeInstrumental) {
            throw new PiAPIUserError(
                "makeInstrumental is not compatible with title, tags, negativeTags, please remove them if you want to make the music instrumental"
            );
        }
        requestBody = {
            model: Model.MusicS,
            task_type: "generate_music_custom" as any,
            input: {
                prompt: prompt,
                title: title,
                tags: tags,
                negative_tags: negativeTags,
            }
        };
    } else {
        requestBody = {
            model: Model.MusicS,
            task_type: "generate_music" as any,
            input: {
                prompt: prompt,
                make_instrumental: makeInstrumental,
            }
        };
    }

    // Utiliser le gestionnaire de tâches unifié
    const result = await handleTask(requestBody, apiKey, ignoreSSLErrors, logger, modelConfig);
    
    // Parser la sortie Suno
    const clips = parseSunoMusicOutput(result.taskId, result.output);
    
    return {
        clips,
        taskId: result.taskId,
        usage: result.usage,
        processingTime: result.processingTime
    };
}

/**
 * Génère une vidéo avec Luma
 */
async function generateLumaVideo(
    prompt: string,
    duration: string,
    aspectRatio: string | undefined,
    keyFrame: string | undefined,
    apiKey: string,
    ignoreSSLErrors: boolean,
    logger: ExtendedLogger
): Promise<{ videoRaw: LumaResult, lastFrame: LumaResult, taskId: string, usage: string, processingTime?: number }> {
    logger.info(`Génération vidéo Luma`, { prompt, duration, aspectRatio });

    // Obtenir la configuration du modèle
    const modelConfig = PIAPI_MODEL_CONFIG[Model.Luma];
    if (!modelConfig) {
        throw new PiAPIUserError(`Unsupported model: ${Model.Luma}`);
    }

    // Construction du corps de la requête
    const requestData: ApiCallParams = {
        model: Model.Luma,
        task_type: "video_generation" as any,
        input: {
            prompt,
            duration: duration === "5s" ? 5 : 10,
            aspect_ratio: aspectRatio,
            key_frames: {
                frame0: {
                    type: keyFrame ? "image" : "",
                    url: keyFrame,
                },
            },
        }
    };

    // Utiliser le gestionnaire de tâches unifié
    const result = await handleTask(requestData, apiKey, ignoreSSLErrors, logger, modelConfig);
    
    // Parser la sortie Luma
    const [video_raw, last_frame] = parseLumaOutput(result.taskId, result.output);
    
    return {
        videoRaw: video_raw,
        lastFrame: last_frame,
        taskId: result.taskId,
        usage: result.usage,
        processingTime: result.processingTime
    };
}

/**
 * Ajoute les outils Suno et Luma au serveur MCP.
 */
export function Add_Tool(server: FastMCP, config: AppConfig, logger: ExtendedLogger): void {
    
    if (!config.validateTool(ToolName)) return;
        
    if (!config.PiAPI.ApiKey) {
        logger.error("Clé API PiAPI manquante dans la configuration");
        return;
    }

    // Outil Suno Music Generation
    server.addTool({
        name: "piapi_generate_music_suno",
        description: "Generate music using Suno",
        parameters: z.object({
            prompt: z.string().max(3000).describe("The prompt to generate a music from, limited to 3000 characters"),
            makeInstrumental: z.boolean().optional().default(false).describe("Whether to make the music instrumental, defaults to false. Not compatible with title, tags, negativeTags"),
            title: z.string().max(80).optional().describe("The title of the music, limited to 80 characters"),
            tags: z.string().max(200).optional().describe("The tags of the music, limited to 200 characters"),
            negativeTags: z.string().max(200).optional().describe("The negative tags of the music, limited to 200 characters"),
        }),
        execute: async (args) => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil 'piapi_generate_music_suno':`, args);

                try {
                    const result = await generateSunoMusic(
                        args.prompt,
                        args.makeInstrumental || false,
                        args.title,
                        args.tags,
                        args.negativeTags,
                        config.PiAPI.ApiKey,
                        config.PiAPI.IgnoreSSLErrors,
                        logger
                    );
                    
                    let contents: { type: "text", text: string }[] = [
                        { type: "text", text: `TaskId: ${result.taskId}` },
                        { type: "text", text: `Music generated successfully! Usage: ${result.usage} tokens` },
                        { type: "text", text: `Processing time: ${result.processingTime?.toFixed(1) || 'unknown'} seconds` }
                    ];

                    for (const clip of result.clips) {
                        contents.push({
                            type: "text",
                            text: `Audio url: ${clip.audio_url}\nImage url: ${clip.image_url}`
                        });
                    }

                    // Si OutputDirectory est spécifié, télécharger et sauvegarder les clips
                    if (config.PiAPI.OuputDirectory) {
                        const outputDir = config.PiAPI.OuputDirectory;
                        
                        if (!fs.existsSync(outputDir)) {
                            fs.mkdirSync(outputDir, { recursive: true });
                        }

                        for (let i = 0; i < result.clips.length; i++) {
                            const clip = result.clips[i];
                            
                            try {
                                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                                const audioFileName = `suno_music_${timestamp}_${i + 1}.mp3`;
                                const audioPath = path.join(outputDir, audioFileName);
                                
                                const audioResponse = await fetch(clip.audio_url);
                                if (!audioResponse.ok) {
                                    throw new Error(`Failed to download audio ${i + 1}: ${audioResponse.statusText}`);
                                }

                                const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
                                await fs.promises.writeFile(audioPath, audioBuffer);

                                contents.push({ 
                                    type: "text", 
                                    text: `Audio ${i + 1} saved: ${audioPath}` 
                                });

                                // Ouvrir le premier audio avec l'application par défaut
                                if (i === 0) {
                                    try {
                                        await open(audioPath);
                                        contents.push({
                                            type: "text",
                                            text: `First audio opened with default application`
                                        });
                                    } catch (openError) {
                                        logger.warn(`Unable to open audio with default application:`, openError);
                                    }
                                }
                            } catch (downloadError) {
                                logger.error(`Error downloading/saving audio ${i + 1}:`, downloadError);
                                const errorMessage = downloadError instanceof Error ? downloadError.message : 'Unknown error';
                                contents.push({
                                    type: "text",
                                    text: `Error saving audio ${i + 1}: ${errorMessage}`
                                });
                            }
                        }
                    }

                    return { content: contents };
                } catch (error) {
                    logger.error(`Error during Suno music generation:`, error);
                    throw error;
                }
            });
        },
    });

    // Outil Luma Video Generation
    server.addTool({
        name: "piapi_generate_video_luma",
        description: "Generate a video using Luma",
        parameters: z.object({
            prompt: z.string().describe("The prompt to generate a video from"),
            duration: z.enum(["5s", "10s"]).optional().default("5s").describe("The duration of the video, defaults to 5s. If keyFrame is provided, only 5s is supported"),
            aspectRatio: z.string().optional().describe("The aspect ratio of the video, defaults to 16:9"),
            keyFrame: z.string().url().optional().describe("The key frame to generate a video with"),
        }),
        execute: async (args) => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil 'piapi_generate_video_luma':`, args);

                try {
                    const result = await generateLumaVideo(
                        args.prompt,
                        args.duration,
                        args.aspectRatio,
                        args.keyFrame,
                        config.PiAPI.ApiKey,
                        config.PiAPI.IgnoreSSLErrors,
                        logger
                    );
                    
                    let contents: { type: "text", text: string }[] = [
                        { type: "text", text: `TaskId: ${result.taskId}` },
                        { type: "text", text: `Video generated successfully! Usage: ${result.usage} tokens` },
                        { type: "text", text: `Processing time: ${result.processingTime?.toFixed(1) || 'unknown'} seconds` },
                        { type: "text", text: `Video url: ${result.videoRaw.url}` },
                        { type: "text", text: `Video resolution: ${result.videoRaw.width}x${result.videoRaw.height}` },
                        { type: "text", text: `Last frame url: ${result.lastFrame.url}` },
                        { type: "text", text: `Last frame resolution: ${result.lastFrame.width}x${result.lastFrame.height}` }
                    ];

                    // Si OutputDirectory est spécifié, télécharger et sauvegarder la vidéo
                    if (config.PiAPI.OuputDirectory) {
                        const outputDir = config.PiAPI.OuputDirectory;
                        
                        if (!fs.existsSync(outputDir)) {
                            fs.mkdirSync(outputDir, { recursive: true });
                        }

                        try {
                            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                            const videoFileName = `luma_video_${timestamp}.mp4`;
                            const videoPath = path.join(outputDir, videoFileName);
                            
                            const videoResponse = await fetch(result.videoRaw.url);
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
                    logger.error(`Error during Luma video generation:`, error);
                    throw error;
                }
            });
        },
    });
}
