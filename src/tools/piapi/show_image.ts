import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import { ExtendedLogger } from "../../helpers/logger.js";

export const ToolName: string = `piapi_show_image`;

/**
 * Ajoute l'outil au serveur MCP.
 */
export function Add_Tool(server: FastMCP, config: AppConfig, logger: ExtendedLogger): void {
    
    if (!config.validateTool(ToolName)) return;

    const ClientArgsSchema = z.object({
        url: z.string().url().describe("The URL of the image to show"),
    });

    server.addTool({
        name: ToolName,
        description: "Show an image with pixels less than 768*1024 due to Claude limitation",
        parameters: ClientArgsSchema,
        execute: async (args) => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil '${ToolName}':`, args);

                try {
                    return {
                        content: [
                            {
                                type: "image" as const,
                                data: args.url,
                                mimeType: "image/png"
                            }
                        ]
                    };
                } catch (error) {
                    logger.error(`Erreur lors de l'affichage de l'image:`, error);
                    throw error;
                }
            });
        },
    });
}
