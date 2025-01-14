import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import { ExtendedLogger } from "../../helpers/logger.js";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export const ToolName: string = `npm_build`;

/**
 * Execute npm run build in the specified directory
 * @param workingDir Directory where to run npm run build
 * @param logger Logger instance for operation tracking
 */
async function executeNpmBuild(workingDir: string, logger: ExtendedLogger): Promise<string> {
    try {
        const command = 'npm run build';
        logger.info(`Executing command: ${command} in directory: ${workingDir}`);
        
        const { stdout, stderr } = await execAsync(command, { cwd: workingDir });
        
        if (stderr) {
            logger.warn(`npm stderr: ${stderr}`);
        }
        
        logger.info(`npm stdout: ${stdout}`);
        return stdout;
    } catch (error) {
        logger.error(`Failed to execute npm run build: ${error}`);
        throw error;
    }
}

/**
 * Adds the npm build tool to the MCP server.
 * 
 * @param server FastMCP server instance
 * @param config Application configuration containing allowed directories
 * @param logger Logger instance for operation tracking
 */
export function Add_Tool(server: FastMCP, config: AppConfig, logger: ExtendedLogger): void {
    
    // Check if tool is allowed
    if (!config.validateTool(ToolName))
        return;

    // Schema for input parameters
    const ClientArgsSchema = z.object({
        workingDir: z.string()
    });

    // Add tool to server
    server.addTool({
        name: ToolName,
        description: "Executes 'npm run build' in the specified directory. " +
                    "Only works within allowed directories.",
        parameters: ClientArgsSchema,
        execute: async (args, context) => {
            return logger.withOperationContext(async () => {
                logger.info(`Calling tool '${ToolName}':`, args);

                try {
                    // Validate and resolve working directory
                    const workingDir = config.validatePath(args.workingDir);
                    
                    // Execute npm run build
                    const output = await executeNpmBuild(workingDir, logger);
                    
                    return `Successfully executed npm run build in ${workingDir}:\n${output}`;
                } catch (error) {
                    logger.error(`${ToolName} failed:`, error);
                    throw error;
                }
            });
        },
    });
}