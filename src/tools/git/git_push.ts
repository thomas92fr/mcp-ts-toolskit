import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import { ExtendedLogger } from "../../helpers/logger.js";
import { createGitInstance, validateGitRepository, GitOperationResult } from "./common.js";

export const ToolName: string = `git_push`;

/**
 * Pushes changes to a remote repository
 * @param workingDir Directory of the git repository
 * @param remote Remote name (default: 'origin')
 * @param branch Branch name (default: 'main')
 * @param force Whether to force push (use with caution)
 * @param logger Logger instance for operation tracking
 */
async function executeGitPush(
    workingDir: string,
    remote: string,
    branch: string,
    force: boolean,
    logger: ExtendedLogger
): Promise<GitOperationResult> {
    try {
        // Validate repository
        await validateGitRepository(workingDir, logger);

        const git = createGitInstance(workingDir);
        logger.info(`Pushing to ${remote}/${branch} from directory: ${workingDir}${force ? ' (force)' : ''}`);
        
        const pushOptions = ['--progress'];
        if (force) {
            pushOptions.push('--force');
        }

        await git.push(remote, branch, pushOptions);
        
        const message = `Successfully pushed to ${remote}/${branch}${force ? ' (force push)' : ''}`;
        logger.info(message);
        
        return {
            success: true,
            message
        };
    } catch (error) {
        const errorMessage = `Failed to push repository: ${error}`;
        logger.error(errorMessage);
        return {
            success: false,
            message: errorMessage,
            error: String(error)
        };
    }
}

/**
 * Adds the git push tool to the MCP server.
 */
export function Add_Tool(server: FastMCP, config: AppConfig, logger: ExtendedLogger): void {
    // Check if tool is allowed
    if (!config.validateTool(ToolName))
        return;

    // Schema for input parameters
    const ClientArgsSchema = z.object({
        workingDir: z.string(),
        remote: z.string().default('origin'),
        branch: z.string().default('main'),
        force: z.boolean().default(false)
    });

    // Add tool to server
    server.addTool({
        name: ToolName,
        description: "Pushes changes to a remote git repository. " +
                    "Can optionally force push (use with caution). " +
                    "Only works within allowed directories.",
        parameters: ClientArgsSchema,
        execute: async (args, context) => {
            return logger.withOperationContext(async () => {
                logger.info(`Calling tool '${ToolName}':`, args);

                try {
                    // Validate and resolve working directory
                    const workingDir = config.validatePath(args.workingDir);
                    
                    // Execute git push
                    const result = await executeGitPush(
                        workingDir,
                        args.remote,
                        args.branch,
                        args.force,
                        logger
                    );
                    
                    return result.success 
                    ? result.message 
                    : `Error: ${result.message}`;;
                } catch (error) {
                    logger.error(`${ToolName} failed:`, error);
                    throw error;
                }
            });
        },
    });
}