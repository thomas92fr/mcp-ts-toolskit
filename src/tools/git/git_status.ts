import { z } from "zod";
import { FastMCP } from "fastmcp";
import type { StatusResult } from 'simple-git';
import { AppConfig } from "../../models/appConfig.js";
import { ExtendedLogger } from "../../helpers/logger.js";
import { createGitInstance, validateGitRepository } from "./common.js";

export const ToolName: string = `git_status`;

export interface GitStatus {
    isClean: boolean;
    staged: string[];
    modified: string[];
    untracked: string[];
    ahead: number;
    behind: number;
    current: string;    // Changé de string | null à string
    tracking: string;   // Changé de string | null à string
}

/**
 * Gets the status of a git repository
 * @param workingDir Directory of the git repository
 * @param logger Logger instance for operation tracking
 */
async function executeGitStatus(
    workingDir: string,
    logger: ExtendedLogger
): Promise<GitStatus> {
    try {
        // Validate repository
        await validateGitRepository(workingDir, logger);

        const git = createGitInstance(workingDir);
        logger.info(`Getting status for repository in directory: ${workingDir}`);
        
        // Get status
        const status: StatusResult = await git.status();
        
        // Get ahead/behind counts
        const tracking = await git.raw(['rev-list', '--left-right', '--count', `${status.tracking || 'HEAD'}...${status.current || 'HEAD'}`])
            .then(result => {
                const [behind, ahead] = result.trim().split('\t').map(Number);
                return { ahead, behind };
            })
            .catch(() => ({ ahead: 0, behind: 0 }));
        
        const result: GitStatus = {
            isClean: status.isClean(),
            staged: status.staged,
            modified: status.modified,
            untracked: status.not_added,
            ahead: tracking.ahead,
            behind: tracking.behind,
            current: status.current || 'HEAD',    // Valeur par défaut si null
            tracking: status.tracking || 'HEAD'   // Valeur par défaut si null
        };

        logger.info(`Successfully retrieved git status`);
        
        return result;
    } catch (error) {
        logger.error(`Failed to get repository status: ${error}`);
        throw error;
    }
}

/**
 * Adds the git status tool to the MCP server.
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
        description: "Gets the status of a git repository including staged, modified, and untracked files. " +
                    "Also shows ahead/behind counts for the current branch. " +
                    "Only works within allowed directories.",
        parameters: ClientArgsSchema,
        execute: async (args, context) => {
            return logger.withOperationContext(async () => {
                logger.info(`Calling tool '${ToolName}':`, args);

                try {
                    // Validate and resolve working directory
                    const workingDir = config.validatePath(args.workingDir);
                    
                    // Execute git status
                    const result = await executeGitStatus(workingDir, logger);
                    
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