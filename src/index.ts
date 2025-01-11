import { FastMCP } from "fastmcp";
import { z } from "zod";
import { loadConfig } from "./helpers/loadConfig.js";
import { createLogger } from "./helpers/logger.js";

let logger = null;
try {
    
    // Charger la configuration
    const config = await loadConfig();    
    const configString = JSON.stringify(config, null, 2);
    const configMsg = `Configuration loaded:\n${configString}`;
    console.error(configMsg);

    logger = createLogger();
    logger.info(configMsg);
      
    // Créer et configurer le serveur
    const server = new FastMCP({
        name: "mcp-ts-toolskit",
        version: "0.1.0",
    });

    server.addTool({
        name: "add",
        description: "Add two numbers",
        parameters: z.object({
            a: z.number(),
            b: z.number(),
        }),
        execute: async (args, {log}) => {
            console.error(`test`)
            return String(args.a + args.b);
        },
    });

    server.start({
        transportType: "stdio",
    });

    
    
} catch (error) {
    if (error instanceof Error) {
        logger?.error(error.message, { error }); // Passe l'objet Error complet
    } else {
        logger?.error(String(error));
    }
    console.error(error); // Affiche la stack trace dans la console
    process.exit(1);
}