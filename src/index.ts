import { FastMCP } from "fastmcp";
import { loadConfig } from "./helpers/loadConfig.js";
import { createLogger, ExtendedLogger } from "./helpers/logger.js";
import * as FileSystem from "./tools/filesystem/index.js";
import * as Web from "./tools/web/index.js";
import * as Pandoc from "./tools/pandoc/index.js";
import * as Npm from "./tools/npm/index.js";
import * as DotNet from "./tools/dotnet/index.js";
import * as System from "./tools/system/index.js";
import * as Git from "./tools/git/index.js";
import * as Ressources from "./resources/index.js";
import * as PiAPI from "./tools/piapi/index.js";


const SERVER_NAME = `mcp-ts-toolskit`;
const SERVER_VERSION = `1.5.2`;

let tmplogger : ExtendedLogger | null = null;
try {
    
    //on récupere l'emplacement du index.js 
    const basePath = process.cwd();
    
    // Charger la configuration
    const config = await loadConfig(basePath);    
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
    FileSystem.ListAllowedDirectories.Add_Tool(server, config, logger);
    FileSystem.ReadMultipleFiles.Add_Tool(server, config, logger);
    FileSystem.SearchFiles.Add_Tool(server, config, logger);
    FileSystem.MoveFile.Add_Tool(server, config, logger);
    FileSystem.DirectoryTree.Add_Tool(server, config, logger);
    FileSystem.CreateDirectory.Add_Tool(server, config, logger);
    FileSystem.EditFile.Add_Tool(server, config, logger);
    FileSystem.WriteFile.Add_Tool(server, config, logger);
    FileSystem.SearchFileContent.Add_Tool(server, config, logger);

    //ajout des outils web
    Web.BraveSearch.Add_Tool(server, config, logger);
    Web.GetWebPageContent.Add_Tool(server, config, logger);

    //ajout des outils pandoc
    Pandoc.MarkdownToDocument.Add_Tool(server, config, logger);

    //ajout des outils npm
    Npm.NpmInstall.Add_Tool(server, config, logger);
    Npm.NpmBuild.Add_Tool(server, config, logger);

    //ajout des outils dotnet
    DotNet.DotNetTool.Add_Tool(server, config, logger);
    DotNet.SerializeCsharp.Add_Tool(server, config, logger);
    DotNet.AnalyzeCsharpDependencies.Add_Tool(server, config, logger);
    

    //ajout des outils systeme
    System.GetCurrentDateTime.Add_Tool(server, config, logger);

     //ajout des outils git
    Git.GitClone.Add_Tool(server, config, logger);
    Git.GitCommit.Add_Tool(server, config, logger);
    Git.GitPull.Add_Tool(server, config, logger);
    Git.GitPush.Add_Tool(server, config, logger);
    Git.GitResolveConflicts.Add_Tool(server, config, logger);
    Git.GitStatus.Add_Tool(server, config, logger);
    Git.GitCheckout.Add_Tool(server, config, logger);
    Git.GitFetch.Add_Tool(server, config, logger);
    Git.GitDiff.Add_Tool(server, config, logger);
    Git.GitLog.Add_Tool(server, config, logger);

    //ajout des outils PiAPI
    PiAPI.TextToImage.Add_Tool(server, config, logger);
    PiAPI.GetTaskStatus.Add_Tool(server, config, logger);
    PiAPI.ImageTo3D.Add_Tool(server, config, logger);
    PiAPI.MusicGeneration.Add_Tool(server, config, logger);  
    PiAPI.ExtendMusic.Add_Tool(server, config, logger);  
    PiAPI.TestControlnetLora.Add_Tool(server, config, logger);  

    Ressources.GetLogs.Add_Ressource(server, config, logger);
    Ressources.Flux1ImagePrompt.Add_Ressource(server, config, logger);
    Ressources.MusicGenerationPrompt.Add_Ressource(server, config, logger);
    
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