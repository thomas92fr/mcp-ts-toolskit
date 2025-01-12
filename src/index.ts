import { FastMCP } from "fastmcp";
import { loadConfig } from "./helpers/loadConfig.js";
import { createLogger, ExtendedLogger } from "./helpers/logger.js";
import path from "path";
import { fileURLToPath } from "url";
import * as FileSystem_ReadMultipleFiles from "./tools/filesystem/read_multiple_files.js";
import * as FileSystem_ListAllowedDirectories from "./tools/filesystem/list_allowed_directories.js";
import * as FileSystem_GetFileInfo from "./tools/filesystem/get_file_info.js";
import * as FileSystem_SearchFiles from "./tools/filesystem/search_files.js";
import * as FileSystem_MoveFile from "./tools/filesystem/move_file.js";


const SERVER_NAME = `mcp-ts-toolskit`;
const SERVER_VERSION = `0.1.0`;

let tmplogger : ExtendedLogger | null = null;
try {
    
    //on récupere l'emplacement du index.js 
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    
    // Charger la configuration
    const config = await loadConfig(__dirname);    
    // Vérification de type pour rassurer TypeScript
    if (!config) {
        throw new Error('config initialization failed');
    }

    const configString = JSON.stringify(config, null, 2);
    const configMsg = `Configuration loaded:\n${configString}`;
    console.error(configMsg);
 
    //chargement du logger fichier
    tmplogger = createLogger(config);

    // Vérification de type pour rassurer TypeScript
    if (!tmplogger) {
        throw new Error('Logger initialization failed');
    }
    const logger = tmplogger!;

    //logger.info(configMsg);
      
    // Créer et configurer le serveur
    const server = new FastMCP({
        name: SERVER_NAME,
        version: SERVER_VERSION,
    });

    //on bind les events du serveur vers les logs
    server.on("connect", (event) => {
        logger?.info("Client connected:", event.session);

        event.session.on("rootsChanged", (event) => {
            logger?.info("Roots changed:", event.roots);
          });
          
        event.session.on("error", (event) => {
            logger?.error("Error:", event.error);
          });
    
      });
      
    server.on("disconnect", (event) => {
        logger?.info("Client disconnected:", event.session);
    });
  
    //ajout des outils
    FileSystem_ListAllowedDirectories.Add_Tool(server, config, logger);
    FileSystem_ReadMultipleFiles.Add_Tool(server, config, logger);
    FileSystem_GetFileInfo.Add_Tool(server, config, logger);
    FileSystem_SearchFiles.Add_Tool(server, config, logger);
    FileSystem_MoveFile.Add_Tool(server, config, logger);

    //démarrage du serveur MCP sur stdio
    server.start({
        transportType: "stdio",
    });   

    logger.info("Serveur démarré sur stdio", { name: SERVER_NAME , version: SERVER_VERSION });
    
} catch (error) {
    if (error instanceof Error) {
        tmplogger?.error(error.message, { error }); // Passe l'objet Error complet
    } else {
        tmplogger?.error(String(error));
    }
    console.error(error); // Affiche la stack trace dans la console
    process.exit(1);
}