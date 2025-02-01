import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import { ExtendedLogger } from "../../helpers/logger.js";
import { stringify } from 'yaml';
import fs from 'fs';
import path from 'path';
import { checkTaskStatus } from './get_task_status.js';
import { MusicTypesParams, Model, TaskType, LyricsType } from "./types/music_types.js";
import open from 'open';

export const ToolName: string = `piapi_music_generation`;

interface GeneratedSong {
    title: string;
    audioUrl: string;
    imageUrl: string;
    lyrics: string;
    duration: number;
    tags: string[];
    localPath?: string;
}

/**
 * Génère de la musique via l'API PiAPI.ai
 */
async function generateMusic(
    gpt_description_prompt: string,
    model: Model,
    task_type: TaskType,
    lyrics_type: LyricsType,
    negative_tags: string = "",
    prompt: string = "",
    make_instrumental: boolean = false,
    apiKey: string,
    ignoreSSLErrors: boolean,
    logger: ExtendedLogger
): Promise<GeneratedSong[]> {
    logger.info(`Génération de musique`, { gpt_description_prompt, model, task_type, lyrics_type });

    const url = 'https://api.piapi.ai/api/v1/task';

    const requestData: MusicTypesParams = {
        model: model,
        task_type: task_type,
        input: {
            gpt_description_prompt,
            lyrics_type,
            negative_tags,
            prompt,
            make_instrumental
        }
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

    // Attendre la complétion de la tâche et convertir en type MusicApiResponse
    const taskResult = await checkTaskStatus(taskId, apiKey, logger);
    
    // Vérifier et convertir la réponse en MusicApiResponse
    if (!taskResult.data.output?.songs || !Array.isArray(taskResult.data.output.songs)) {
        throw new Error('Réponse invalide : pas de tableau de chansons dans la sortie');
    }

    // Extraire les données des chansons
    const songs: GeneratedSong[] = taskResult.data.output.songs.map((song: any) => ({
        title: song.title || 'Sans titre',
        audioUrl: song.song_path || '',
        imageUrl: song.image_path || '',
        lyrics: song.lyrics || '',
        duration: song.duration || 0,
        tags: Array.isArray(song.tags) ? song.tags : []
    }));

    if (songs.length === 0) {
        throw new Error('Aucune chanson n\'a été générée');
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
        gpt_description_prompt: z.string().describe("Description textuelle de la musique à générer"),
        model: z.enum([Model.MusicU, Model.MusicS])
            .default(Model.MusicU)
            .describe("Modèle à utiliser (music-u: génération simple, music-s: version test avancée)"),
        task_type: z.enum([TaskType.GenerateMusic, TaskType.GenerateMusicCustom])
            .default(TaskType.GenerateMusic)
            .describe("Type de tâche (generate_music: standard, generate_music_custom: personnalisé)"),
        lyrics_type: z.enum([LyricsType.Generate, LyricsType.Instrumental, LyricsType.User])
            .default(LyricsType.Generate)
            .describe("Type de génération des paroles (generate: à partir de la description, instrumental: sans paroles, user: paroles fournies)"),
        negative_tags: z.string()
            .default("")
            .describe("Tags négatifs pour exclure certains styles (format: 'tag1,tag2')"),
        prompt: z.string()
            .default("")
            .describe("Paroles personnalisées pour le mode 'user'"),
        make_instrumental: z.boolean()
            .default(false)
            .describe("Si true, génère une version instrumentale")
    });

    server.addTool({
        name: ToolName,
        description: "Génère de la musique à partir d'une description textuelle en utilisant l'API PiAPI.ai. " +
            "Supporte différents modèles et modes de génération de paroles.",
        parameters: ClientArgsSchema,
        execute: async (args) => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil '${ToolName}':`, args);

                try {
                    const songs = await generateMusic(
                        args.gpt_description_prompt,
                        args.model,
                        args.task_type,
                        args.lyrics_type,
                        args.negative_tags,
                        args.prompt,
                        args.make_instrumental,
                        config.PiAPI.ApiKey,
                        config.PiAPI.IgnoreSSLErrors,
                        logger
                    );
                    
                    let contents: { type: "text", text: string }[] = [];

                    // Traitement de chaque chanson générée
                    for (const [index, song] of songs.entries()) {
                        contents.push({ 
                            type: "text",
                            text: `\nChanson ${index + 1}:\nTitre: ${song.title}\nDurée: ${song.duration.toFixed(2)} secondes\nTags: ${song.tags.join(', ')}\nURL audio: ${song.audioUrl}\nURL image: ${song.imageUrl}\n\nParoles:\n${song.lyrics}`
                        });

                        // Si OutputDirectory est spécifié, télécharger et sauvegarder l'audio
                        if (config.PiAPI.OuputDirectory) {
                            const outputDir = config.PiAPI.OuputDirectory;
                            
                            if (!fs.existsSync(outputDir)) {
                                fs.mkdirSync(outputDir, { recursive: true });
                            }

                            // Téléchargement et sauvegarde du fichier audio
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
                                text: `\nFichiers sauvegardés:\nAudio: ${audioPath}`
                            });

                            // Ouvrir le fichier audio avec l'application par défaut
                            try {
                                await open(audioPath);
                                contents.push({
                                    type: "text",
                                    text: `Fichier audio ouvert avec l'application par défaut`
                                });
                            } catch (error) {
                                logger.warn(`Impossible d'ouvrir le fichier audio avec l'application par défaut:`, error);
                                contents.push({
                                    type: "text",
                                    text: `Note: Impossible d'ouvrir le fichier audio automatiquement`
                                });
                            }
                        }
                    }

                    return { content: contents };
                } catch (error) {
                    logger.error(`Erreur lors de la génération de musique:`, error);
                    throw error;
                }
            });
        },
    });
}
