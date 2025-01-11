import path from 'path';
import { fileExists } from "./file.js";
import { AppConfig } from '../models/appConfig.js';

export async function loadConfig(): Promise<AppConfig|null> {
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
        // Utiliser le répertoire de travail actuel
        const currentDir = process.cwd();
        
        // Liste des emplacements possibles pour config.json
        const possiblePaths = [
            path.join(currentDir, 'config.json'),           // À la racine du projet
            path.join(currentDir, 'dist', 'config.json'),   // Dans le dossier dist
        ];
        
        // Chercher dans tous les emplacements possibles
        for (const potentialPath of possiblePaths) {
            if (fileExists(potentialPath)) {
                configPath = potentialPath;
                break;
            }
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
    return await AppConfig.loadFromFile(configPath);
   
}