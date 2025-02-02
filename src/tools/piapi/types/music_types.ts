/**
 * Interface principale pour la création de tâches musicales avec l'API PiAPI
 */
export interface MusicTypesParams {
    /** Configuration optionnelle pour le webhook et autres paramètres */
    config?: Config;
    /** Paramètres d'entrée pour la génération de musique */
    input: Input;
    /**
     * Modèle à utiliser pour la génération de musique
     * music-u : API Udio, génération simple avec ou sans paroles
     * music-s : Version test avec support des modes description et personnalisé
     */
    model: Model;
    /**
     * Type de tâche à effectuer
     * generate_music : Génération standard
     * generate_music_custom : Génération avec paramètres personnalisés (music-s uniquement)
     */
    task_type: TaskType;
    [property: string]: any;
}

/**
 * Configuration de la tâche
 */
export interface Config {
    /** Configuration du webhook pour les notifications */
    webhook_config?: WebhookConfig;
    [property: string]: any;
}

/**
 * Configuration du webhook pour recevoir les notifications de l'API
 */
export interface WebhookConfig {
    /** URL de l'endpoint qui recevra les notifications */
    endpoint?: string;
    /** Clé secrète pour la sécurisation des notifications */
    secret?: string;
    [property: string]: any;
}

/**
 * Paramètres d'entrée pour la génération de musique
 */
export interface Input {
    /**
     * Description textuelle pour la génération de musique
     * Utilisé uniquement avec le type generate_music
     */
    gpt_description_prompt?: string;
    /**
     * Type de génération de paroles (uniquement pour music-u)
     * generate : génère les paroles à partir de la description
     * instrumental : génère une version instrumentale
     * user : utilise les paroles fournies par l'utilisateur
     */
    lyrics_type?: LyricsType;
    /**
     * Indique si la sortie doit être instrumentale (sans voix)
     * Utilisé principalement avec music-s
     */
    make_instrumental?: boolean;
    /**
     * Tags négatifs pour exclure certains styles ou éléments
     * Format: chaîne de caractères séparée par des virgules (ex: 'pop,rock')
     */
    negative_tags?: string;
    /**
     * Paroles ou texte fourni par l'utilisateur
     * Format attendu pour les paroles : [Verse]...[Chorus]...
     */
    prompt?: string;
    /**
     * Valeur seed pour la génération (uniquement pour music-u)
     * Permet de reproduire une génération spécifique
     */
    seed?: number;
    /**
     * Tags pour définir le style musical
     * Format: chaîne de caractères séparée par des virgules (ex: 'jazz,piano')
     */
    tags?: string;
    /**
     * Titre de la musique à générer
     * Utilisé principalement dans le mode personnalisé
     */
    title?: string;
    /**
     * Pour le modèle music-s uniquement
     */
    custom_mode?: boolean;
    continue_at?: number;
    continue_clip_id?: string;
    mv?: string;
    [property: string]: any;
}

/**
 * Types de génération de paroles disponibles pour le modèle music-u
 */
export enum LyricsType {
    /** Génère une chanson complète à partir d'une description */
    Generate = "generate",
    /** Génère une version instrumentale */
    Instrumental = "instrumental",
    /** Utilise les paroles fournies par l'utilisateur */
    User = "user",
}

/**
 * Modèles disponibles pour la génération de musique
 */
export enum Model {
    /** Modèle en test avec support des modes description et personnalisé */
    MusicS = "music-s",
    /** API Udio pour la génération simple avec ou sans paroles */
    MusicU = "music-u",
}

/**
 * Types de tâches disponibles
 */
export enum TaskType {
    /** Génération standard de musique */
    GenerateMusic = "generate_music",
    /** Génération personnalisée (uniquement disponible avec music-s) */
    GenerateMusicCustom = "generate_music_custom",
}

/**
 * Interface pour une chanson générée par music-u
 */
export interface UdioSong {
    id: string;
    title: string;
    image_path: string;
    lyrics?: string;
    song_path: string;
    duration: number;
    tags: string[];
    finished: boolean;
    error_type: string | null;
    error_code: string | null;
    error_detail: string | null;
}

/**
 * Interface pour un clip généré par music-s
 */
export interface SunoClip {
    id: string;
    video_url: string;
    audio_url: string;
    image_url: string;
    image_large_url: string;
    is_video_pending: boolean;
    major_model_version: string;
    model_name: string;
    metadata: {
        duration: number;
        tags: string;
        type: string;
        error_type: string;
        error_message: string;
        [key: string]: any;
    };
    status: string;
    title: string;
    [key: string]: any;
}

/**
 * Interface commune pour représenter une génération musicale
 */
export interface GeneratedSong {
    id: string;
    title: string;
    audioUrl: string;
    imageUrl: string;
    videoUrl?: string;
    lyrics?: string;
    duration: number;
    tags: string[];
    model: Model;
    localPath?: string;
}