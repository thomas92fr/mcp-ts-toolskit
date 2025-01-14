import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import { ExtendedLogger } from "../../helpers/logger.js";
import { createGitInstance, validateGitRepository, GitOperationResult } from "./common.js";

export const ToolName: string = `git_pull`;

/**
 * Pulls latest changes from a remote repository
 * @param workingDir Directory of the git repository
 * @param remote Remote name (default: 'origin')
 * @param branch Branch name (default: 'main')
 * @param logger Logger instance for operation tracking
 */
async function executeGitPull(
    workingDir: string,
    remote: string,
    branch: string,
    logger: ExtendedLogger
): Promise<GitOperationResult> {
    try {
        // Validate repository
        await validateGitRepository(workingDir, logger);

        const git = createGitInstance(workingDir);
        logger.info(`Pulling from ${remote}/${branch} in directory: ${workingDir}`);
        
        await git.pull(remote, branch);
        
        const message = `Successfully pulled from ${remote}/${branch}`;
        logger.info(message);
        
        return {
            success: true,
            message
        };
    } catch (error) {
        const errorMessage = `Failed to pull repository: ${error}`;
        logger.error(errorMessage);
        return {
            success: false,
            message: errorMessage,
            error: String(error)
        };
    }
}

/**
 * Adds the git pull tool to the MCP server.
 */
export function Add_Tool(server: FastMCP, config: AppConfig, logger: ExtendedLogger): void {
    // Check if tool is allowed
    if (!config.validateTool(ToolName))
        return;

    // Schema for input parameters
    const ClientArgsSchema = z.object({
        workingDir: z.string(),
        remote: z.string().default('origin'),
        branch: z.string().default('main')
    });

    // Add tool to server
    server.addTool({
        name: ToolName,
        description: "Pulls latest changes from a remote git repository. " +
                    "Only works within allowed directories.",
        parameters: ClientArgsSchema,
        execute: async (args, context) => {
            return logger.withOperationContext(async () => {
                logger.info(`Calling tool '${ToolName}':`, args);

                try {
                    // Validate and resolve working directory
                    const workingDir = config.validatePath(args.workingDir);
                    
                    // Execute git pull
                    const result = await executeGitPull(
                        workingDir,
                        args.remote,
                        args.branch,
                        logger
                    );
                    
                    return result.success 
                    ? result.message 
                    : `Error: ${result.message}`;
                } catch (error) {
                    logger.error(`${ToolName} failed:`, error);
                    throw error;
                }
            });
        },
    });
}