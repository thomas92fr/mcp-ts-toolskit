import path from 'path';
import fs from 'fs';

/**
 * Configuration spécifique pour Pandoc
 */
export interface IPandocConfig {
    /**
     * Chemin vers l'executable de Pandoc
     */
    PandocPath: string;
}


/**
 * Configuration spécifique pour GIT
 */
export interface IGitConfig {
    /**
     * Nom de l'utilisateur, utilisé pour les opérations GIT
     */
    UserName: string;

    /**
     * Email de l'utilisateur, utilisé pour les opérations GIT
     */
    UserEmail: string;

    /**
     * Mot de passe de l'utilisateur, utilisé pour les opérations GIT (en remote)
     */
    UserPassword: string;
}

/**
 * Configuration spécifique pour BraveSearch API
 */
export interface IBraveSearchConfig {
    /**
     * Token a utiliser pour les appels a l'API BraveSearch
     */
    ApiKey: string;

    /**
     * Indique si on ignore ou non les erreurs SSL lors des appels a l'API BraveSearch
     */
    IgnoreSSLErrors: boolean;
}

/**
 * Configuration spécifique pour BraveSearch API
 */
export interface IPiAPI {
    /**
     * Token a utiliser pour les appels a l'API PiAPI
     */
    ApiKey: string;

    /**
     * Indique si on ignore ou non les erreurs SSL lors des appels a l'API PiAPI
     */
    IgnoreSSLErrors: boolean;

    /**
     * Dossier dans lequel seront déposé les fichiers créés avec les outils PiAPI
     */
    OuputDirectory: string;
}


/**
 * Interface de configuration de l'application
 */
export interface IAppConfig {
    /**
     * Dossier du fichier de configuration
     */
    BasePath: string;

    /**
     * Liste des répertoires autorisés pour les opérations sur le système de fichiers
     */
    AllowedDirectories: string[];

    /**
     * Liste des outils interdits
     */
    ForbiddenTools: string[];

    /**
     * Configuration spécifique pour BraveSearch API
     */
    BraveSearch: IBraveSearchConfig;

    /**
     * Configuration spécifique pour PiAPI
     */
    PiAPI: IPiAPI;

    /**
     * Configuration spécifique pour GIT
     */
    Git: IGitConfig;

    /**
     * Nombre de lignes de logs à afficher dans la ressource logs
     */
    LogsNumberToShow: number;
}

/**
 * Classe implémentant l'interface IAppConfig avec les valeurs par défaut
 */
export class AppConfig implements IAppConfig {
    BasePath: string = process.cwd();
    AllowedDirectories: string[] = [];
    ForbiddenTools: string[] = [];
    BraveSearch: IBraveSearchConfig = {
        ApiKey: '',
        IgnoreSSLErrors: false
    };
    PiAPI: IPiAPI = {
        ApiKey: '',
        IgnoreSSLErrors: false,
        OuputDirectory: ''
    };
    Git: IGitConfig = {
        UserName: '',
        UserEmail: '',
        UserPassword: ''
    };
    Pandoc: IPandocConfig = {
       PandocPath: ''
    };
    LogsNumberToShow:number = 50;

    /**
     * Convertit les chemins relatifs en chemins absolus par rapport au répertoire de l'application
     */
    private normalizePathProperties(): void {
        // Normalise le chemin des logs
        if (this.BasePath) {
            this.BasePath = path.resolve(this.BasePath);
        }

        if (this.PiAPI.OuputDirectory) {
            this.PiAPI.OuputDirectory = path.resolve(this.PiAPI.OuputDirectory);
        }

        // Normalise les chemins des répertoires autorisés
        if (this.AllowedDirectories) {
           
            this.AllowedDirectories = this.AllowedDirectories.map(dir => path.resolve(dir));

            if (this.PiAPI.OuputDirectory) {
                if (!this.AllowedDirectories.some(dir => dir == this.PiAPI.OuputDirectory)) {
                    this.AllowedDirectories.push(this.PiAPI.OuputDirectory);
                }
            }
        }
    }

    /**
     * Valide qu'un chemin est dans un répertoire autorisé
     * @throws {Error} Si le chemin n'est pas dans un répertoire autorisé
     */
    validatePath(filePath: string): string {
        const fullPath = path.resolve(filePath);
        if (!this.AllowedDirectories.some(dir => fullPath.startsWith(path.resolve(dir)))) {
            throw new Error(`Access denied - path outside allowed directories: ${fullPath}`);
        }
        return fullPath;
    }

    /**
     * Valide qu'un nom d'outils est autorisé
     */
    validateTool(toolName: string): boolean {
        return !this.ForbiddenTools.some(tool => 
            tool?.toLowerCase() === toolName?.toLowerCase());
    }

    /**
     * Charge la configuration depuis un fichier JSON
     */
    static async loadFromFile(filePath: string): Promise<AppConfig> {
        try {         
            console.error( `Loading configuration from ${filePath}`);
            const fileContent = await fs.promises.readFile(filePath, 'utf-8');
            const config = Object.assign(new AppConfig(), JSON.parse(fileContent));
            config.normalizePathProperties();
            return config;
        } catch (error: unknown) {
            if (error instanceof Error) {
                throw new Error(`Failed to load configuration from ${filePath}: ${error.message}`);
            } else {
                throw new Error(`Failed to load configuration from ${filePath}: ${String(error)}`);
            }        
        }
    
    }

    /**
     * Retourne une représentation JSON indentée de la configuration
     */
    toString(): string {
        return JSON.stringify(this, null, 2);
    }
}
