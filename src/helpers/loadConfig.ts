import path from 'path';
import { fileExists } from "./file.js";
import { AppConfig } from '../models/appConfig.js';

/**
* Charge la configuration de l'application à partir d'un fichier JSON.
* Cette fonction recherche le fichier de configuration selon un ordre de priorité défini,
* le charge et initialise une instance de AppConfig.
* 
* Ordre de recherche du fichier de configuration :
* 1. Argument en ligne de commande (premier argument finissant par 'config.json')
* 2. Variable d'environnement 'MCP_TOOLSKIT_CONFIG_PATH'
* 3. Fichier 'config.json' dans le répertoire de base spécifié
* 
* @param base_path Le chemin de base de l'application, utilisé pour la recherche du fichier config.json
*                 et défini comme BasePath dans la configuration
* @returns Une Promise contenant soit :
*          - Une instance de AppConfig initialisée avec les valeurs du fichier
*          - null en cas d'échec du chargement
* @throws Error si aucun fichier de configuration valide n'est trouvé
* 
* @example
* const config = await loadConfig(__dirname);
* if (!config) {
*   throw new Error('Failed to load configuration');
* }
*/
export async function loadConfig(base_path: string): Promise<AppConfig|null> {
    let configPath: string | undefined;
    
    // 1. Vérifier les arguments de ligne de commande
    const args = process.argv.slice(2);
    if (args.length > 0 && args[0].endsWith('config.json') && fileExists(args[0])) {
        configPath = args[0];
    }
    
    // 2. Vérifier la variable d'environnement
    if (!configPath && process.env.MCP_TOOLSKIT_CONFIG_PATH && 
        fileExists(process.env.MCP_TOOLSKIT_CONFIG_PATH)) {
        configPath = process.env.MCP_TOOLSKIT_CONFIG_PATH;
    }
    
    // 3. Vérifier à côté de l'exécutable
    if (!configPath) {
        const defaultConfigPath = path.join(base_path, 'config.json');

        if (fileExists(defaultConfigPath)) {
            configPath = defaultConfigPath;
        }
    }

    // Si aucune configuration n'est trouvée, lever une erreur
    if (!configPath) {
        throw new Error(
            "Configuration file not found. Please provide it through:\n" +
            "1. Command line argument\n" +
            "2. MCP_TOOLSKIT_CONFIG_PATH environment variable\n" +
            "3. config.json file next to the executable"
        );
    }
   
    // Charger et parser le fichier de configuration 
    let config = await AppConfig.loadFromFile(configPath);
    config.BasePath = base_path;
    return config;
   
}