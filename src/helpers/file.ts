import fs from 'fs';

// Fonction helper pour vérifier si un fichier existe
export function fileExists(filePath: string): boolean {
    try {
        return fs.existsSync(filePath);
    } catch {
        return false;
    }
}