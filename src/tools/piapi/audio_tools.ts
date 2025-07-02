import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import { ExtendedLogger } from "../../helpers/logger.js";
import { ApiCallParams, Model, PIAPI_MODEL_CONFIG, PiAPIUserError } from "./types/types.js";
import { handleTask, parseAudioOutput } from "./task_handler.js";
import fs from 'fs';
import path from 'path';
import open from 'open';

export const ToolName: string = `piapi_audio_tools`;

/**
 * Ajoute les outils audio au serveur MCP.
 */
export function Add_Tool(server: FastMCP, config: AppConfig, logger: ExtendedLogger): void {
    
    if (!config.validateTool(ToolName)) return;
        
    if (!config.PiAPI.ApiKey) {
        logger.error("Clé API PiAPI manquante dans la configuration");
        return;
    }

    // Outil MMAudio - Generate music for video
    server.addTool({
        name: "piapi_generate_music_for_video",
        description: "Generate a music for a video using Qubico MMAudio",
        parameters: z.object({
            prompt: z.string().describe("The prompt to generate a music from"),
            negativePrompt: z.string().optional().default("chaos, bad music").describe("The negative prompt to generate a music from"),
            video: z.string().url().describe("The video to generate a music from"),
        }),
        execute: async (args) => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil 'piapi_generate_music_for_video':`, args);

                try {
                    // Obtenir la configuration du modèle
                    const modelConfig = PIAPI_MODEL_CONFIG[Model.QubicoMMAudio];
                    if (!modelConfig) {
                        throw new PiAPIUserError(`Unsupported model: ${Model.QubicoMMAudio}`);
                    }

                    // Construction du corps de la requête
                    const requestData: ApiCallParams = {
                        model: Model.QubicoMMAudio,
                        task_type: "video2audio" as any,
                        input: {
                            prompt: args.prompt,
                            negative_prompt: args.negativePrompt,
                            video: args.video
                        }
                    };

                    // Utiliser le gestionnaire de tâches unifié
                    const result = await handleTask(requestData, config.PiAPI.ApiKey, config.PiAPI.IgnoreSSLErrors, logger, modelConfig);
                    
                    // Parser la sortie audio
                    const url = parseAudioOutput(result.taskId, result.output);
                    
                    let contents: { type: "text", text: string }[] = [
                        { type: "text", text: `TaskId: ${result.taskId}` },
                        { type: "text", text: `Music generated successfully! Usage: ${result.usage} tokens` },
                        { type: "text", text: `Processing time: ${result.processingTime?.toFixed(1) || 'unknown'} seconds` },
                        { type: "text", text: `Music url: ${url}` }
                    ];

                    // Si OutputDirectory est spécifié, télécharger et sauvegarder l'audio
                    if (config.PiAPI.OuputDirectory) {
                        const outputDir = config.PiAPI.OuputDirectory;
                        
                        if (!fs.existsSync(outputDir)) {
                            fs.mkdirSync(outputDir, { recursive: true });
                        }

                        try {
                            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                            const audioFileName = `music_for_video_${timestamp}.mp3`;
                            const audioPath = path.join(outputDir, audioFileName);
                            
                            const audioResponse = await fetch(url);
                            if (!audioResponse.ok) {
                                throw new Error(`Failed to download audio: ${audioResponse.statusText}`);
                            }

                            const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
                            await fs.promises.writeFile(audioPath, audioBuffer);

                            contents.push({ 
                                type: "text", 
                                text: `Audio saved: ${audioPath}` 
                            });

                            // Ouvrir l'audio avec l'application par défaut
                            try {
                                await open(audioPath);
                                contents.push({
                                    type: "text",
                                    text: `Audio opened with default application`
                                });
                            } catch (openError) {
                                logger.warn(`Unable to open audio with default application:`, openError);
                            }
                        } catch (downloadError) {
                            logger.error(`Error downloading/saving audio:`, downloadError);
                            const errorMessage = downloadError instanceof Error ? downloadError.message : 'Unknown error';
                            contents.push({
                                type: "text",
                                text: `Error saving audio: ${errorMessage}`
                            });
                        }
                    }

                    return { content: contents };
                } catch (error) {
                    logger.error(`Error during music generation for video:`, error);
                    throw error;
                }
            });
        },
    });

    // Outil TTS Zero Shot
    server.addTool({
        name: "piapi_tts_zero_shot",
        description: "Zero-shot TTS using Qubico f5-tts",
        parameters: z.object({
            genText: z.string().describe("The text to generate a speech from"),
            refText: z.string().optional().describe("The reference text to generate a speech from, auto detect from refAudio if not provided"),
            refAudio: z.string().url().describe("The reference audio to generate a speech from"),
        }),
        execute: async (args) => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil 'piapi_tts_zero_shot':`, args);

                try {
                    // Obtenir la configuration du modèle
                    const modelConfig = PIAPI_MODEL_CONFIG[Model.QubicoTTS];
                    if (!modelConfig) {
                        throw new PiAPIUserError(`Unsupported model: ${Model.QubicoTTS}`);
                    }

                    // Construction du corps de la requête
                    const requestData: ApiCallParams = {
                        model: Model.QubicoTTS,
                        task_type: "zero-shot" as any,
                        input: {
                            gen_text: args.genText,
                            ref_text: args.refText,
                            ref_audio: args.refAudio
                        }
                    };

                    // Utiliser le gestionnaire de tâches unifié
                    const result = await handleTask(requestData, config.PiAPI.ApiKey, config.PiAPI.IgnoreSSLErrors, logger, modelConfig);
                    
                    // Parser la sortie audio
                    const url = parseAudioOutput(result.taskId, result.output);
                    
                    let contents: { type: "text", text: string }[] = [
                        { type: "text", text: `TaskId: ${result.taskId}` },
                        { type: "text", text: `Speech generated successfully! Usage: ${result.usage} tokens` },
                        { type: "text", text: `Processing time: ${result.processingTime?.toFixed(1) || 'unknown'} seconds` },
                        { type: "text", text: `Speech url: ${url}` }
                    ];

                    // Si OutputDirectory est spécifié, télécharger et sauvegarder l'audio
                    if (config.PiAPI.OuputDirectory) {
                        const outputDir = config.PiAPI.OuputDirectory;
                        
                        if (!fs.existsSync(outputDir)) {
                            fs.mkdirSync(outputDir, { recursive: true });
                        }

                        try {
                            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                            const audioFileName = `speech_${timestamp}.wav`;
                            const audioPath = path.join(outputDir, audioFileName);
                            
                            const audioResponse = await fetch(url);
                            if (!audioResponse.ok) {
                                throw new Error(`Failed to download audio: ${audioResponse.statusText}`);
                            }

                            const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
                            await fs.promises.writeFile(audioPath, audioBuffer);

                            contents.push({ 
                                type: "text", 
                                text: `Speech saved: ${audioPath}` 
                            });

                            // Ouvrir l'audio avec l'application par défaut
                            try {
                                await open(audioPath);
                                contents.push({
                                    type: "text",
                                    text: `Speech opened with default application`
                                });
                            } catch (openError) {
                                logger.warn(`Unable to open audio with default application:`, openError);
                            }
                        } catch (downloadError) {
                            logger.error(`Error downloading/saving audio:`, downloadError);
                            const errorMessage = downloadError instanceof Error ? downloadError.message : 'Unknown error';
                            contents.push({
                                type: "text",
                                text: `Error saving audio: ${errorMessage}`
                            });
                        }
                    }

                    return { content: contents };
                } catch (error) {
                    logger.error(`Error during TTS generation:`, error);
                    throw error;
                }
            });
        },
    });
}
