import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import { ExtendedLogger } from "../../helpers/logger.js";
import { stringify } from 'yaml';
import fs from 'fs';
import path from 'path';
import { checkTaskStatus } from './get_task_status.js';
import { MusicTypesParams, Model, TaskType, LyricsType, UdioSong, SunoClip, GeneratedSong } from "./types/music_types.js";
import open from 'open';

export const ToolName: string = `piapi_music_generation`;

/**
 * Vérifie si un objet est de type SunoClip
 */
function isSunoClip(obj: unknown): obj is SunoClip {
    return obj !== null
        && typeof obj === 'object'
        && 'audio_url' in obj
        && 'video_url' in obj
        && 'image_url' in obj
        && 'metadata' in obj
        && typeof (obj as SunoClip).metadata === 'object'
        && 'duration' in (obj as SunoClip).metadata;
}

/**
 * Vérifie si un objet est de type UdioSong
 */
function isUdioSong(obj: unknown): obj is UdioSong {
    return obj !== null
        && typeof obj === 'object'
        && 'song_path' in obj
        && 'image_path' in obj
        && 'duration' in obj;
}

/**
 * Convertit une UdioSong en GeneratedSong
 */
function convertUdioSongToGenerated(song: UdioSong): GeneratedSong {
    return {
        id:song.id,
        title: song.title || 'Sans titre',
        audioUrl: song.song_path,
        imageUrl: song.image_path,
        lyrics: song.lyrics,
        duration: song.duration,
        tags: Array.isArray(song.tags) ? song.tags : [],
        model: Model.MusicU
    };
}

/**
 * Convertit un SunoClip en GeneratedSong
 */
function convertSunoClipToGenerated(clip: SunoClip): GeneratedSong {
    return {
        id:clip.id,
        title: clip.title || 'Sans titre',
        audioUrl: clip.audio_url,
        imageUrl: clip.image_url,
        videoUrl: clip.video_url,
        duration: clip.metadata.duration,
        tags: clip.metadata.tags ? clip.metadata.tags.split(',').filter(tag => tag.length > 0) : [],
        model: Model.MusicS
    };
}

/**
 * Prépare les paramètres de requête en fonction du modèle
 */
function prepareRequestData(
    gpt_description_prompt: string,
    model: Model,
    task_type: TaskType,
    lyrics_type: LyricsType,
    tags: string,
    negative_tags: string,
    prompt: string,
    make_instrumental: boolean
): MusicTypesParams {
    if (model === Model.MusicU) {
        return {
            model,
            task_type,
            input: {
                gpt_description_prompt,
                lyrics_type,
                tags,
                negative_tags,
                prompt,
                make_instrumental
            }
        };
    } else { // Model.MusicS
        return {
            model,
            task_type,
            input: {
                gpt_description_prompt,   // Ajout du prompt même pour music-s
                continue_at: 0,
                continue_clip_id: "",
                tags,
                negative_tags,
                make_instrumental,
                prompt             // Ajout du prompt pour music-s
            }
        };
    }
}

/**
 * Traite la réponse de l'API en fonction du modèle
 */
export function processApiResponse(result: any, model: Model): GeneratedSong[] {
    if (model === Model.MusicU && result.data.output?.songs) {
        const songs = result.data.output.songs;
        if (!Array.isArray(songs)) {
            throw new Error('Le format des chansons est invalide');
        }
        return songs.filter(isUdioSong).map(convertUdioSongToGenerated);
    } else if (model === Model.MusicS && result.data.output?.clips) {
        const clips = Object.values(result.data.output.clips);
        return clips.filter(isSunoClip).map(convertSunoClipToGenerated);
    }
    throw new Error(`Réponse API invalide pour le modèle ${model}`);
}

/**
 * Génère de la musique via l'API PiAPI.ai
 */
async function generateMusic(
    gpt_description_prompt: string,
    model: Model,
    task_type: TaskType,
    lyrics_type: LyricsType,
    tags: string = "",
    negative_tags: string = "",
    prompt: string = "",
    make_instrumental: boolean = false,
    apiKey: string,
    ignoreSSLErrors: boolean,
    logger: ExtendedLogger
): Promise<GeneratedSong[]> {
    logger.info(`Génération de musique`, { gpt_description_prompt, model, task_type, lyrics_type });

    const url = 'https://api.piapi.ai/api/v1/task';
    const requestData = prepareRequestData(
        gpt_description_prompt,
        model,
        task_type,
        lyrics_type,
        tags,
        negative_tags,
        prompt,
        make_instrumental
    );

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
    const songs = processApiResponse(taskResult, model);

    if (songs.length === 0) {
        throw new Error('Aucune chanson n\'a été générée');
    }
    
    return songs;
}

/**
 * Construit le texte de description pour une chanson générée
 */
function buildSongDescription(song: GeneratedSong, index: number): string {
    let description = `Song/Clip Id: ${song.id}\nChanson ${index + 1}:\nTitre: ${song.title}\nDurée: ${song.duration.toFixed(2)} secondes\nTags: ${song.tags.join(', ')}`;
    
    if (song.model === Model.MusicU) {
        description += `\nURL audio: ${song.audioUrl}`;
        if (song.lyrics) {
            description += `\n\nParoles:\n${song.lyrics}`;
        }
    } else {
        description += `\nURL audio: ${song.audioUrl}`;
        if (song.videoUrl) {
            description += `\nURL vidéo: ${song.videoUrl}`;
        }
    }
    return description;
}

/**
 * Télécharge et sauvegarde un fichier audio
 */
async function downloadAndSaveAudio(
    song: GeneratedSong, 
    index: number, 
    outputDir: string
): Promise<string> {
    const audioFileName = `${song.title.replace(/[^a-z0-9]/gi, '_')}_${index + 1}.mp3`;
    const audioPath = path.join(outputDir, audioFileName);
    
    const audioResponse = await fetch(song.audioUrl);
    if (!audioResponse.ok) {
        throw new Error(`Failed to download audio: ${audioResponse.statusText}`);
    }

    const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
    await fs.promises.writeFile(audioPath, audioBuffer);

    return audioPath;
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
            .describe("Modèle à utiliser (music-u: génération simple 'Udio', music-s: version test avancée 'SunoAi')"),
        task_type: z.enum([TaskType.GenerateMusic, TaskType.GenerateMusicCustom])
            .default(TaskType.GenerateMusic)
            .describe("Type de tâche (generate_music: standard, generate_music_custom: personnalisé uniquement disponible avec le model 'music-s')"),
        lyrics_type: z.enum([LyricsType.Generate, LyricsType.Instrumental, LyricsType.User])
            .default(LyricsType.Generate)
            .describe("Type de génération des paroles (generate: à partir de la description, instrumental: sans paroles, user: paroles fournies)"),
        tags: z.string()
            .default("")
            .describe("Les types de musique. (format: 'tag1,tag2')"),
        negative_tags: z.string()
            .default("")
            .describe("Tags négatifs pour exclure certains styles. (format: 'tag1,tag2')"),
        prompt: z.string()
            .default("")
            .describe("Paroles personnalisées de la musique. Uniquement disponible dans le type de tâche 'generate_music_custom'"),
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
                        args.tags,
                        args.negative_tags,
                        args.prompt,
                        args.make_instrumental,
                        config.PiAPI.ApiKey,
                        config.PiAPI.IgnoreSSLErrors,
                        logger
                    );
                    
                    let contents: { type: "text", text: string }[] = [];

                    for (const [index, song] of songs.entries()) {
                        // Ajouter la description de la chanson
                        contents.push({ 
                            type: "text",
                            text: buildSongDescription(song, index)
                        });

                        // Si OutputDirectory est spécifié, télécharger et sauvegarder l'audio
                        if (config.PiAPI.OuputDirectory) {
                            const outputDir = config.PiAPI.OuputDirectory;
                            
                            if (!fs.existsSync(outputDir)) {
                                fs.mkdirSync(outputDir, { recursive: true });
                            }

                            try {
                                const audioPath = await downloadAndSaveAudio(song, index, outputDir);
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
                    logger.error(`Erreur lors de la génération de musique:`, error);
                    throw error;
                }
            });
        },
    });
}