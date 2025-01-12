import { FastMCP } from "fastmcp";
import { z } from "zod";
import { loadConfig } from "./helpers/loadConfig.js";
import { createLogger } from "./helpers/logger.js";
import * as winston from 'winston';
import path from "path";
import { fileURLToPath } from "url";
import { add_FileSystem_ReadMultipleFiles_Tool, FileSystem_ReadMultipleFiles_ToolName } from "./tools/filesystem/read_multiple_files.js";

let tmplogger : winston.Logger | null = null;
try {
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

    logger.info(configMsg);
      
    // Créer et configurer le serveur
    const server = new FastMCP({
        name: "mcp-ts-toolskit",
        version: "0.1.0",
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
    if(config.validateTool(FileSystem_ReadMultipleFiles_ToolName))
        add_FileSystem_ReadMultipleFiles_Tool(server, config, logger);

    //démarrage du serveur MCP sur stdio
    server.start({
        transportType: "stdio",
    });   
    
} catch (error) {
    if (error instanceof Error) {
        tmplogger?.error(error.message, { error }); // Passe l'objet Error complet
    } else {
        tmplogger?.error(String(error));
    }
    console.error(error); // Affiche la stack trace dans la console
    process.exit(1);
}