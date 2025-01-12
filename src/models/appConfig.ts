import path from 'path';
import fs from 'fs';

/**
 * Configuration spécifique pour GIT
 */
export interface IGitConfig {
    /**
     * Nom de l'utilisateur, utilisé pour les opérations GIT
     */
    userName: string;

    /**
     * Email de l'utilisateur, utilisé pour les opérations GIT
     */
    userEmail: string;

    /**
     * Mot de passe de l'utilisateur, utilisé pour les opérations GIT (en remote)
     */
    userPassword: string;
}

/**
 * Configuration spécifique pour BraveSearch API
 */
export interface IBraveSearchConfig {
    /**
     * Token a utiliser pour les appels a l'API BraveSearch
     */
    apiKey: string;

    /**
     * Indique si on ignore ou non les erreurs SSL lors des appels a l'API BraveSearch
     */
    ignoreSSLErrors: boolean;
}

/**
 * Interface de configuration de l'application
 */
export interface IAppConfig {
    /**
     * Chemin du programme
     */
    basePath: string;

    /**
     * Liste des répertoires autorisés pour les opérations sur le système de fichiers
     */
    allowedDirectories: string[];

    /**
     * Liste des outils interdits
     */
    forbiddenTools: string[];

    /**
     * Configuration spécifique pour BraveSearch API
     */
    braveSearch: IBraveSearchConfig;

    /**
     * Configuration spécifique pour GIT
     */
    git: IGitConfig;
}

/**
 * Classe implémentant l'interface IAppConfig avec les valeurs par défaut
 */
export class AppConfig implements IAppConfig {
    basePath: string = process.cwd();
    allowedDirectories: string[] = [];
    forbiddenTools: string[] = [];
    braveSearch: IBraveSearchConfig = {
        apiKey: '',
        ignoreSSLErrors: false
    };
    git: IGitConfig = {
        userName: '',
        userEmail: '',
        userPassword: ''
    };

    /**
     * Convertit les chemins relatifs en chemins absolus par rapport au répertoire de l'application
     */
    private normalizePathProperties(): void {
        // Normalise le chemin des logs
        if (this.basePath) {
            this.basePath = path.resolve(this.basePath);
        }

        // Normalise les chemins des répertoires autorisés
        if (this.allowedDirectories) {
            this.allowedDirectories = this.allowedDirectories.map(dir => 
                path.resolve(dir));
        }
    }

    /**
     * Valide qu'un chemin est dans un répertoire autorisé
     * @throws {Error} Si le chemin n'est pas dans un répertoire autorisé
     */
    validatePath(filePath: string): string {
        const fullPath = path.resolve(filePath);
        if (!this.allowedDirectories.some(dir => fullPath.startsWith(path.resolve(dir)))) {
            throw new Error(`Access denied - path outside allowed directories: ${fullPath}`);
        }
        return fullPath;
    }

    /**
     * Valide qu'un nom d'outils est autorisé
     */
    validateTool(toolName: string): boolean {
        return !this.forbiddenTools.some(tool => 
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
