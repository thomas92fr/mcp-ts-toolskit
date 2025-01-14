import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import { ExtendedLogger } from "../../helpers/logger.js";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs/promises";
import { spawn } from "child_process";

const execAsync = promisify(exec);

export const ToolName: string = "dotnet_tool";

// Énumération des opérations disponibles
export enum DotNetOperation {
    RunTests = "RunTests"
}

/**
 * Execute dotnet test command for a solution
 * @param solutionPath Path to the .NET solution file
 * @param logger Logger instance for operation tracking
 */
async function executeDotNetTests(solutionPath: string, logger: ExtendedLogger): Promise<string> {
    try {
        const solutionDir = path.dirname(solutionPath);
        const testResultsDir = path.join(solutionDir, "TestResults");
        
        // Créer le dossier TestResults s'il n'existe pas
        await fs.mkdir(testResultsDir, { recursive: true });
        
        logger.info(`Created test results directory: ${testResultsDir}`);

        // Construction de la commande dotnet test avec les mêmes options que dans l'exemple C#
        const args = [
            'test',
            solutionPath,
            '--no-restore',
            '--logger',
            'console;verbosity=detailed',
            '--logger',
            'html;logfilename=TestResults.html',
            '--results-directory',
            testResultsDir
        ];

        const command = `dotnet ${args.join(' ')}`;
        logger.info(`Executing command: ${command} in directory: ${solutionDir}`);

        return new Promise((resolve, reject) => {
            const process = spawn('dotnet', args, {
                cwd: solutionDir,
                shell: true
            });

            let output = '';
            let errorOutput = '';

            process.stdout.on('data', (data) => {
                const text = data.toString();
                output += text;
                logger.info(`Process output: ${text.trim()}`);
            });

            process.stderr.on('data', (data) => {
                const text = data.toString();
                errorOutput += `ERROR: ${text}`;
                logger.error(`Process error: ${text.trim()}`);
            });

            process.on('close', (code) => {
                logger.info(`Process completed with exit code: ${code}`);
                
                // Ajouter le chemin du rapport HTML à la sortie
                const resultMessage = `${output}\n\nTest results HTML report: ${path.join(testResultsDir, "TestResults.html")}`;
                
                if (code === 0 || code === null) {
                    resolve(resultMessage);
                } else {
                    reject(new Error(`Process failed with code ${code}.\n${errorOutput}`));
                }
            });

            process.on('error', (error) => {
                logger.error('Failed to start process:', error);
                reject(error);
            });
        });
    } catch (error) {
        logger.error(`Failed to execute dotnet test: ${error}`);
        throw error;
    }
}

/**
 * Adds the DotNet tool to the MCP server.
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
        operation: z.nativeEnum(DotNetOperation).default(DotNetOperation.RunTests),
        solutionFile: z.string()
    });

    // Add tool to server
    server.addTool({
        name: ToolName,
        description: "Executes operations on .NET solutions. " +
                    "Currently supports running unit tests and generating test reports. " +
                    "Only works within allowed directories.",
        parameters: ClientArgsSchema,
        execute: async (args, context) => {
            return logger.withOperationContext(async () => {
                logger.info(`Calling tool '${ToolName}': ${JSON.stringify(args)}`);

                try {
                    // Validate solution file path
                    const solutionDir = path.dirname(args.solutionFile);
                    const validatedDir = config.validatePath(solutionDir);
                    
                    // Vérifier que le répertoire existe
                    try {
                        await fs.access(validatedDir);
                    } catch {
                        throw new Error(`Solution directory not found: ${validatedDir}`);
                    }

                    // Vérifier que le fichier solution existe
                    try {
                        await fs.access(args.solutionFile);
                    } catch {
                        throw new Error(`Solution file not found: ${args.solutionFile}`);
                    }

                    // Exécuter l'opération demandée
                    let output: string;
                    switch (args.operation) {
                        case DotNetOperation.RunTests:
                            output = await executeDotNetTests(args.solutionFile, logger);
                            break;
                        default:
                            throw new Error(`Unknown operation: ${args.operation}`);
                    }

                    return output;
                } catch (error) {
                    logger.error(`${ToolName} failed:`, error);
                    throw error;
                }
            });
        },
    });
}