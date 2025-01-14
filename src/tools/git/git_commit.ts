import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import { ExtendedLogger } from "../../helpers/logger.js";
import { createGitInstance, validateGitRepository, GitOperationResult } from "./common.js";

export const ToolName: string = `git_commit`;

/**
 * Commits changes in a git repository
 * @param workingDir Directory of the git repository
 * @param message Commit message
 * @param files Optional array of specific files to commit (commits all changes if not specified)
 * @param author Optional author information in format "Name <email>"
 * @param logger Logger instance for operation tracking
 */
async function executeGitCommit(
    workingDir: string,
    message: string,
    files: string[] | undefined,
    author: string | undefined,
    logger: ExtendedLogger
): Promise<GitOperationResult> {
    try {
        // Validate repository
        await validateGitRepository(workingDir, logger);

        const git = createGitInstance(workingDir);

        // Add files
        if (files && files.length > 0) {
            logger.info(`Adding specific files: ${files.join(', ')}`);
            await git.add(files);
        } else {
            logger.info('Adding all changes');
            await git.add('.');
        }

        // Build commit options
        const commitOptions: any = {
            '--message': message
        };
        
        if (author) {
            commitOptions['--author'] = author;
        }

        // Perform commit
        logger.info(`Committing changes with message: ${message}`);
        await git.commit(message, files, commitOptions);
        
        const commitMessage = `Successfully committed changes${files ? ' for specific files' : ''}`;
        logger.info(commitMessage);
        
        return {
            success: true,
            message: commitMessage
        };
    } catch (error) {
        const errorMessage = `Failed to commit changes: ${error}`;
        logger.error(errorMessage);
        return {
            success: false,
            message: errorMessage,
            error: String(error)
        };
    }
}

/**
 * Adds the git commit tool to the MCP server.
 */
export function Add_Tool(server: FastMCP, config: AppConfig, logger: ExtendedLogger): void {
    // Check if tool is allowed
    if (!config.validateTool(ToolName))
        return;

    // Schema for input parameters
    const ClientArgsSchema = z.object({
        workingDir: z.string(),
        message: z.string(),
        files: z.array(z.string()).optional(),
        author: z.string().optional()
    });

    // Add tool to server
    server.addTool({
        name: ToolName,
        description: "Commits changes in a git repository. " +
                    "Can optionally specify files to commit and author information. " +
                    "Only works within allowed directories.",
        parameters: ClientArgsSchema,
        execute: async (args, context) => {
            return logger.withOperationContext(async () => {
                logger.info(`Calling tool '${ToolName}':`, args);

                try {
                    // Validate and resolve working directory
                    const workingDir = config.validatePath(args.workingDir);
                    
                    // Execute git commit
                    const result = await executeGitCommit(
                        workingDir,
                        args.message,
                        args.files,
                        args.author,
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