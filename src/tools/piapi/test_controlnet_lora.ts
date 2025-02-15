import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import { ExtendedLogger } from "../../helpers/logger.js";
import { ApiCallParams, Model, TaskType, ApiResponse } from "./types/types.js";
import { stringify } from 'yaml';
import { checkTaskStatus } from './get_task_status.js';

export const ToolName: string = `piapi_test_controlnet_lora`;

/**
 * Génère une image test en utilisant ControlNet et LoRA via l'API PiAPI.ai avec des paramètres fixes
 * 
 * @param apiKey Clé API PiAPI.ai
 * @param logger Instance du logger
 * @returns L'URL de l'image générée
 */
async function generateTestImage(
    apiKey: string,
    logger: ExtendedLogger,
): Promise<string> {
    logger.info(`Test de génération d'image avec ControlNet et LoRA`);

    const url = 'https://api.piapi.ai/api/v1/task';

    // Construction du corps de la requête avec les paramètres fixes
    const requestData: ApiCallParams = {
        model: Model.QubicoFlux1DevAdvanced,
        task_type: TaskType.ControlnetLora,
        input: {
            steps: 28,
            prompt: "person enjoying a day at the park, full hd, cinematic",
            negative_prompt: "low quality, ugly, distorted, artefacts",
            guidance_scale: 4.0,
            control_net_settings: [
                {
                    control_type: "openpose",
                    control_image: "https://i.ibb.co/vkCbMZY/3-pose-1024.jpg",
                    control_strength: 0.7,
                    return_preprocessed_image: true
                }
            ],
            lora_settings: [
                {
                    lora_type: "mjv6",
                    lora_strength: 1
                }
            ]
        }
    };

    // Création des options de fetch
    const fetchOptions: RequestInit = {
        method: 'POST',
        headers: {
            'X-API-Key': apiKey,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData)
    };

    // Exécution de la requête initiale
    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Erreur API PiAPI`, { status: response.status, statusText: response.statusText, error: errorText });
        throw new Error(`PiAPI error: ${response.status} ${response.statusText}\n${errorText}`);
    }

    const result = await response.json() as ApiResponse;
    
    // Vérification de la réponse initiale
    if (result.code !== 200) {
        logger.error(`Erreur lors de la création de la tâche`, result);
        throw new Error(`Task creation failed: ${result.message}`);
    }

    const taskId = result.data.task_id;
    logger.info(`Tâche créée, attente du résultat...\n${stringify(result.data)}`, { taskId });

    // Attendre la complétion de la tâche
    const taskResult = await checkTaskStatus(taskId, apiKey, logger);
    
    // Vérifier la présence de l'URL de l'image
    if (!taskResult.data.output?.image_url) {
        throw new Error('No image URL in completed task');
    }
    
    return taskResult.data.output.image_url;
}

/**
 * Ajoute l'outil de test au serveur MCP.
 * 
 * @param server Instance du serveur FastMCP sur laquelle ajouter l'outil
 * @param config Configuration de l'application contenant notamment la clé API
 * @param logger Instance du logger pour tracer les opérations
 */
export function Add_Tool(server: FastMCP, config: AppConfig, logger: ExtendedLogger): void {
    
    //on regarde si l'outil n'est pas interdit
    if (!config.validateTool(ToolName))
        return;
        
    // Vérification de la présence de la clé API
    if (!config.PiAPI.ApiKey) {
        logger.error("Clé API PiAPI manquante dans la configuration");
        return;
    }

    // Ajout de l'outil au serveur
    server.addTool({
        name: ToolName,
        description: "Tests the PiAPI ControlNet+LoRA generation with fixed test parameters",
        parameters: z.object({}), // Aucun paramètre requis
        execute: async () => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil de test '${ToolName}'`);

                try {
                    const imageUrl = await generateTestImage(
                        config.PiAPI.ApiKey,
                        logger
                    );
                    
                    return {
                        content: [
                            { 
                                type: "text", 
                                text: `URL de l'image: ${imageUrl}` 
                            }
                        ]
                    };
                    
                } catch (error) {
                    logger.error(`Erreur lors de la génération d'image:`, error);
                    throw error;
                }
            });
        },
    });
}
