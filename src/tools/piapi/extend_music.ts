import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import { ExtendedLogger } from "../../helpers/logger.js";
import { stringify } from 'yaml';
import fs from 'fs';
import path from 'path';
import open from 'open';
import { checkTaskStatus } from './get_task_status.js';
import { Model, GeneratedSong } from "./types/music_types.js";
import { processApiResponse } from "./music_generation.js";

export const ToolName: string = `piapi_extend_music`;

/**
 * Étend une musique existante via l'API PiAPI.ai
 */
async function extendMusic(
    prompt: string,
    continue_clip_id: string,
    apiKey: string,
    ignoreSSLErrors: boolean,
    logger: ExtendedLogger,
    tags: string = "",
    negative_tags: string = ""
): Promise<GeneratedSong[]> {
    logger.info(`Extension de musique`, { continue_clip_id, tags, negative_tags });

    const url = 'https://api.piapi.ai/api/v1/task';
    // Préparer les paramètres d'entrée de base
    const input = {
        prompt,
        continue_clip_id,
        make_instrumental: false,
        tags,
        negative_tags
    };

    const requestData = {
        model: "music-s",
        task_type: "generate_music_custom",
        input
    };

    const fetchOptions: RequestInit = {
        method: 'POST',
        headers: {
            'X-API-Key': apiKey,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData)
    };

    if (ignoreSSLErrors) {
        logger.info('SSL verification disabled');
        Object.assign(fetchOptions, {
            agent: new (await import('node:https')).Agent({
                rejectUnauthorized: false
            })
        });
    }

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Erreur API PiAPI`, { status: response.status, statusText: response.statusText, error: errorText });
        throw new Error(`PiAPI error: ${response.status} ${response.statusText}\n${errorText}`);
    }

    const result = await response.json();
    
    if (result.code !== 200) {
        logger.error(`Erreur lors de la création de la tâche`, result);
        throw new Error(`Task creation failed: ${result.message}`);
    }

    const taskId = result.data.task_id;
    logger.info(`Tâche créée, attente du résultat...\n${stringify(result.data)}`, { taskId });

    const taskResult = await checkTaskStatus(taskId, apiKey, logger);
    const songs = processApiResponse(taskResult, Model.MusicS);

    if (songs.length === 0) {
        throw new Error('Aucune extension musicale n\'a été générée');
    }
    
    return songs;
}

/**
 * Ajoute l'outil au serveur MCP.
 */
export function Add_Tool(server: FastMCP, config: AppConfig, logger: ExtendedLogger): void {
    
    if (!config.validateTool(ToolName)) return;
        
    if (!config.PiAPI.ApiKey) {
        logger.error("Clé API PiAPI manquante dans la configuration");
        return;
    }

    const ClientArgsSchema = z.object({      
        continue_clip_id: z.string().describe("ID du clip musical à étendre"),
        prompt: z.string()
            .describe("Paroles personnalisées de la musique."),     
        tags: z.string()
            .default("")
            .describe("Les types de musique. (format: 'tag1,tag2')"),
        negative_tags: z.string()
            .default("")
            .describe("Tags négatifs pour exclure certains styles. (format: 'tag1,tag2')"),
    });

    server.addTool({
        name: ToolName,
        description: "Étend une musique existante générée par PiAPI.ai en utilisant son ID et un timestamp",
        parameters: ClientArgsSchema,
        execute: async (args) => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil '${ToolName}':`, args);

                try {
                    const songs = await extendMusic(
                        args.prompt,
                        args.continue_clip_id,
                        config.PiAPI.ApiKey,
                        config.PiAPI.IgnoreSSLErrors,
                        logger,
                        args.tags,
                        args.negative_tags
                    );
                    
                    let contents: { type: "text", text: string }[] = [];

                    // Pour chaque chanson générée
                    for (const [index, song] of songs.entries()) {
                        // Ajouter la description de la chanson
                        contents.push({ 
                            type: "text",
                            text: `Extension ${index + 1}:\nID: ${song.id}\nTitre: ${song.title}\nDurée: ${song.duration.toFixed(2)} secondes\nURL Audio: ${song.audioUrl}\n${song.videoUrl ? `URL Vidéo: ${song.videoUrl}\n` : ''}\nTags: ${song.tags.join(', ')}`
                        });

                        // Si OutputDirectory est spécifié, télécharger et sauvegarder l'audio
                        if (config.PiAPI.OuputDirectory) {
                            const outputDir = config.PiAPI.OuputDirectory;
                            
                            if (!fs.existsSync(outputDir)) {
                                fs.mkdirSync(outputDir, { recursive: true });
                            }

                            try {
                                // Télécharger et sauvegarder le fichier audio
                                const audioFileName = `${song.title.replace(/[^a-z0-9]/gi, '_')}_${index + 1}.mp3`;
                                const audioPath = path.join(outputDir, audioFileName);
                                
                                const audioResponse = await fetch(song.audioUrl);
                                if (!audioResponse.ok) {
                                    throw new Error(`Failed to download audio: ${audioResponse.statusText}`);
                                }

                                const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
                                await fs.promises.writeFile(audioPath, audioBuffer);

                                contents.push({ 
                                    type: "text",
                                    text: `\nFichier audio sauvegardé: ${audioPath}`
                                });

                                // Ouvrir le fichier audio avec l'application par défaut
                                try {
                                    await open(audioPath);
                                    contents.push({
                                        type: "text",
                                        text: `Fichier audio ouvert avec l'application par défaut`
                                    });
                                } catch (openError) {
                                    logger.warn(`Impossible d'ouvrir le fichier audio avec l'application par défaut:`, openError);
                                    contents.push({
                                        type: "text",
                                        text: `Note: Impossible d'ouvrir le fichier audio automatiquement`
                                    });
                                }
                            } catch (downloadError) {
                                logger.error(`Erreur lors du téléchargement/sauvegarde du fichier audio:`, downloadError);
                                const errorMessage = downloadError instanceof Error ? downloadError.message : 'Erreur inconnue';
                                contents.push({
                                    type: "text",
                                    text: `Erreur lors de la sauvegarde du fichier audio: ${errorMessage}`
                                });
                            }
                        }
                    }

                    return { content: contents };
                    
                } catch (error) {
                    logger.error(`Erreur lors de l'extension de la musique:`, error);
                    throw error;
                }
            });
        }
    });
}