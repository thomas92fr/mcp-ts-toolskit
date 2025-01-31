export interface ApiCallParams {
    config?: Config;
    /**
     * the input param of the flux task
     */
    input: Input;
    /**
     * the model name, can be `Qubico/flux1-dev` or `Qubico/flux1-schnell` or
     * `Qubico/flux1-dev-advanced`
     */
    model: Model;
    task_type: TaskType;
    [property: string]: any;
}

export interface Config {
    /**
     * This allows users to choose whether this specific task will get processed under PAYG or
     * HYA mode. If unspecified, then this task will get processed under whatever mode (PAYG or
     * HYA)
     * the user chose on the workspace setting of your account.
     * - `public` means this task will be processed under PAYG mode.
     * - `private` means this task will be processed under HYA mode.
     */
    service_mode?: ServiceMode;
    /**
     * Webhook provides timely task notifications. Check [PiAPI webhook](/docs/unified-webhook)
     * for detail.
     */
    webhook_config?: WebhookConfig;
    [property: string]: any;
}

/**
 * This allows users to choose whether this specific task will get processed under PAYG or
 * HYA mode. If unspecified, then this task will get processed under whatever mode (PAYG or
 * HYA)
 * the user chose on the workspace setting of your account.
 * - `public` means this task will be processed under PAYG mode.
 * - `private` means this task will be processed under HYA mode.
 */
export enum ServiceMode {
    Private = "private",
    Public = "public",
}

/**
 * Webhook provides timely task notifications. Check [PiAPI webhook](/docs/unified-webhook)
 * for detail.
 */
export interface WebhookConfig {
    endpoint?: string;
    secret?: string;
    [property: string]: any;
}

/**
 * the input param of the flux task
 */
export interface Input {
    /**
     * number of images, only works for schnell at the moment. Price will be
     * batch_size * (price for one generation)
     */
    batch_size?: number;
    /**
     * Check [Flux with LoRA and Controlnet](/docs/flux-with-lora-and-controlnet)
     */
    control_net_settings?: ControlNetSetting[];
    /**
     * Guidance scale for image generation. High guidance scales improve prompt adherence at the
     * cost of reduced realism.
     */
    guidance_scale?: number;
    /**
     * can be used in txt2img ONLY, width*height cannot exceed 1048576
     */
    height?: number;
    /**
     * Check [Flux with LoRA and Controlnet](/docs/flux-with-lora-and-controlnet)
     */
    lora_settings?: LoraSetting[];
    negative_prompt?: string;
    prompt: string;
    /**
     * can be used in txt2img ONLY, width*height cannot exceed 1048576
     */
    width?: number;
    [property: string]: any;
}

export interface ControlNetSetting {
    /**
     * image url of the control image
     */
    control_image?: string;
    /**
     * name of the controlnet model, check [Available LoRA and
     * Controlnet](/docs/available-lora-and-controlnet)
     */
    control_type: string;
    [property: string]: any;
}

export interface LoraSetting {
    /**
     * optional
     */
    lora_image?: string;
    /**
     * name of the lora model, check [Available LoRA and
     * Controlnet](/docs/available-lora-and-controlnet)
     */
    lora_type?: string;
    [property: string]: any;
}

/**
 * the model name, can be `Qubico/flux1-dev` or `Qubico/flux1-schnell` or
 * `Qubico/flux1-dev-advanced`
 */
export enum Model {
    QubicoFlux1Dev = "Qubico/flux1-dev",
    QubicoFlux1DevAdvanced = "Qubico/flux1-dev-advanced",
    QubicoFlux1Schnell = "Qubico/flux1-schnell",
}

export enum TaskType {
    ControlnetLora = "controlnet-lora",
    FillInpaint = "fill-inpaint",
    FillOutpaint = "fill-outpaint",
    Img2Img = "img2img",
    Img2ImgLora = "img2img-lora",
    ReduxVariation = "redux-variation",
    Txt2Img = "txt2img",
    Txt2ImgLora = "txt2img-lora",
}


//Réponse


export interface ApiResponse {
    code: number;
    data: Data;
    /**
     * If you get non-null error message, here are some steps you chould follow:
     * - Check our [common error
     * message](https://climbing-adapter-afb.notion.site/Common-Error-Messages-6d108f5a8f644238b05ca50d47bbb0f4)
     * - Retry for several times
     * - If you have retried for more than 3 times and still not work, file a ticket on Discord
     * and our support will be with you soon.
     */
    message: string;
    [property: string]: any;
}

export interface Data {
    detail: null;
    error: Error;
    input: { [key: string]: any };
    logs: { [key: string]: any }[];
    meta: Meta;
    model: string;
    output: Output;
    /**
     * Hover on the "Completed" option and you coult see the explaintion of all status:
     * completed/processing/pending/failed/staged
     */
    status: Status;
    task_id: string;
    task_type: string;
    [property: string]: any;
}

export interface Error {
    code?: number;
    message?: string;
    [property: string]: any;
}

export interface Meta {
    /**
     * The time when the task was submitted to us (staged and/or pending)
     */
    created_at?: string;
    /**
     * The time when the task finished processing.
     */
    ended_at?: string;
    is_using_private_pool: boolean;
    /**
     * The time when the task started processing. the time from created_at to time of started_at
     * is time the job spent in the "staged“ stage and/or the"pending" stage if there were any.
     */
    started_at?: string;
    usage: Usage;
    [property: string]: any;
}

export interface Usage {
    consume: number;
    frozen: number;
    type: string;
    [property: string]: any;
}

export interface Output {
    /**
     * if the result contains only one image
     */
    image_url?: string;
    /**
     * if the result contains multiple images
     */
    image_urls?: string[];
    [property: string]: any;
}

/**
 * Hover on the "Completed" option and you coult see the explaintion of all status:
 * completed/processing/pending/failed/staged
 */
export enum Status {
    Completed = "Completed",
    Failed = "Failed",
    Pending = "Pending",
    Processing = "Processing",
    Staged = "Staged",
}
