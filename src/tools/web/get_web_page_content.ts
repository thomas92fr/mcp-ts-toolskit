import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import { ExtendedLogger } from "../../helpers/logger.js";
import puppeteer from "puppeteer-core";
import { promises as fs } from 'fs';

export const ToolName: string = `get_web_page_content`;
let browser: puppeteer.Browser | null = null;

async function getChromePath(): Promise<string> {
    const platform = process.platform;
    
    switch (platform) {
      case 'win32': {
        const possiblePaths = [
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`, 
          `${process.env.APPDATA}\\Google\\Chrome\\Application\\chrome.exe`
        ];
        
        for (const path of possiblePaths) {
          try {
            await fs.access(path);
            return path;
          } catch {
            continue;
          }
        }
        return '';
      }
      
      case 'darwin':
        return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
        
      case 'linux': {
        const possiblePaths = [
          '/usr/bin/google-chrome',
          '/usr/bin/chromium-browser',
          '/usr/bin/chromium'
        ];
        
        for (const path of possiblePaths) {
          try {
            await fs.access(path);
            return path;
          } catch {
            continue;
          }
        }
        return '';
      }
        
      default:
        throw new Error(`Plateforme non supportée: ${platform}`);
    }
}

async function initBrowser(logger: ExtendedLogger): Promise<void> {
  if (browser && !browser.connected) {
    logger.debug(`le navigateur n'est plus connecté`);
     browser = null;
   }
  
  if (!browser) {
        logger.debug('Initialisation du navigateur');
        browser = await puppeteer.launch({
            headless: false,
            executablePath: await getChromePath(),
            args: ["--no-sandbox", "--disable-setuid-sandbox"]
        });
    }
}

async function getPageContent(
    url: string,
    logger: ExtendedLogger
): Promise<string> {
    logger.debug(`Navigation vers l'URL`, { url });

    await initBrowser(logger);
    if (!browser) throw new Error("Impossible d'initialiser le navigateur");

    const page = await browser.newPage();
    try {
        const width = 1280 ;
        const height = 720;
        await page.setViewport({ width, height });
        await page.goto(url, { waitUntil: 'networkidle0' });
        

        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const result = await page.evaluate(`
            function getSimplifiedHTML() {
                const clone = document.body.cloneNode(true);
                clone.querySelectorAll('script, style, iframe, img').forEach(el => el.remove());
                
                const simplified = Array.from(clone.querySelectorAll('*'))
                    .filter(el => {
                        const text = el.textContent.trim();
                        const isLink = el.tagName === 'A' && el.href;
                        const hasContent = text && text.length > 1;
                        return hasContent || isLink;
                    })
                    .map(el => {
                        const text = el.textContent.trim()
                            .replace(/\s+/g, ' ')
                            .replace(/\\n+/g, ' ');
                        if (!text) return '';
                        if (el.tagName === 'A') {
                            return \`<a href="\${el.href}">\${text}</a>\`;
                        }
                        return \`<\${el.tagName.toLowerCase()}>\${text}</\${el.tagName.toLowerCase()}>\`;
                    })
                    .filter(Boolean)
                    .join(' ');
                
                return simplified.replace(/\\n+/g, ' ').trim();
            }
            getSimplifiedHTML();
        `);

        logger.debug(`Contenu récupéré, longueur: ${result?.toString().length} caractères`);
        return result?.toString() || '';
    } finally {
        //await page.close();
    }
}

export function Add_Tool(server: FastMCP, config: AppConfig, logger: ExtendedLogger): void {
    if (!config.validateTool(ToolName)) return;

    const ClientArgsSchema = z.object({
        url: z.string().url().describe("URL of the web page to retrieve")
    });

    server.addTool({
        name: ToolName,
        description: "Retrieve the complete HTML content of a web page using Puppeteer.' which means navigating to a URL and retrieving the text of the web page.",
        parameters: ClientArgsSchema,
        execute: async (args, context) => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil '${ToolName}':`, args);
                try {
                    const content = await getPageContent(args.url, logger);
                    logger.info(`Page récupérée avec succès`);
                    return content;
                } catch (error) {
                    logger.error(`Erreur lors de la récupération de la page:`, error);
                    throw error;
                }
            });
        },
    });
}