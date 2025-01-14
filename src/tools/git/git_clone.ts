import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import { ExtendedLogger } from "../../helpers/logger.js";
import { createGitInstance, GitOperationResult } from "./common.js";

export const ToolName: string = `git_clone`;

/**
 * Clones a Git repository into the specified directory
 * @param repositoryUrl URL of the Git repository to clone
 * @param targetDir Directory where to clone the repository
 * @param branch Branch to clone (optional)
 * @param logger Logger instance for operation tracking
 */
async function executeGitClone(
    repositoryUrl: string,
    targetDir: string,
    branch: string | undefined,
    logger: ExtendedLogger
): Promise<GitOperationResult> {
    try {
        const git = createGitInstance(targetDir);
        logger.info(`Cloning repository: ${repositoryUrl} to directory: ${targetDir}`);

        const cloneOptions = ['--progress'];
        if (branch) {
            cloneOptions.push('--branch', branch);
        }

        await git.clone(repositoryUrl, targetDir, cloneOptions);
        
        const message = `Successfully cloned ${repositoryUrl}${branch ? ` (branch: ${branch})` : ''} to ${targetDir}`;
        logger.info(message);
        
        return {
            success: true,
            message
        };
    } catch (error) {
        const errorMessage = `Failed to clone repository: ${error}`;
        logger.error(errorMessage);
        return {
            success: false,
            message: errorMessage,
            error: String(error)
        };
    }
}

/**
 * Adds the git clone tool to the MCP server.
 */
export function Add_Tool(server: FastMCP, config: AppConfig, logger: ExtendedLogger): void {
    // Check if tool is allowed
    if (!config.validateTool(ToolName))
        return;

    // Schema for input parameters
    const ClientArgsSchema = z.object({
        repositoryUrl: z.string().url(),
        targetDir: z.string(),
        branch: z.string().optional()
    });

    // Add tool to server
    server.addTool({
        name: ToolName,
        description: "Clones a Git repository into the specified directory. " +
                    "Can optionally specify a branch to clone. " +
                    "Only works within allowed directories.",
        parameters: ClientArgsSchema,
        execute: async (args, context) => {
            return logger.withOperationContext(async () => {
                logger.info(`Calling tool '${ToolName}':`, args);

                try {
                    // Validate and resolve target directory
                    const targetDir = config.validatePath(args.targetDir);
                    
                    // Execute git clone
                    const result = await executeGitClone(
                        args.repositoryUrl,
                        targetDir,
                        args.branch,
                        logger
                    );
                    
                    // Convert result to string to match Tool interface requirements
                    return JSON.stringify(result, null, 2);
                } catch (error) {
                    logger.error(`${ToolName} failed:`, error);
                    throw error;
                }
            });
        },
    });
}