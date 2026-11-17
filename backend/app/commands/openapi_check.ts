import { BaseCommand } from '@adonisjs/core/ace'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openapiDocumentPath, renderOpenApiDocument } from '#openapi/document'
import { formatDiff, diffLines } from '#openapi/diff'

/**
 * Comprueba que el documento OpenAPI versionado sigue siendo el que genera el
 * código.
 *
 * Este comando **solo compara**. No reescribe `docs/api/openapi.json`, no
 * arregla nada y no toca las rutas: si el documento versionado está
 * desfasado, dice que lo está, enseña en qué se diferencia y sale con código
 * de error distinto de cero. Arreglarlo es cosa de `openapi:generate`, que
 * se ejecuta a propósito y con el cambio a la vista.
 *
 * La comparación se hace contra una **regeneración en un directorio
 * temporal**: el documento se construye otra vez, desde el router y los
 * decoradores de los controladores, y se escribe en un fichero fuera del
 * repositorio. El fichero versionado solo se lee.
 */
export default class OpenapiCheck extends BaseCommand {
  static commandName = 'openapi:check'
  static description = 'Regenera el documento OpenAPI en un temporal y lo compara con el versionado'

  /**
   * Igual que `openapi:generate`, el comando necesita la aplicación
   * arrancada: el documento se construye a partir del router.
   */
  static options = { startApp: true }

  async run() {
    const versioned = openapiDocumentPath()

    // El temporal es de verdad temporal: se crea un directorio propio y se
    // borra al terminar, pase lo que pase.
    const workspace = await mkdtemp(join(tmpdir(), 'flowsync-openapi-'))
    const regenerated = join(workspace, 'openapi.json')

    try {
      await writeFile(regenerated, await renderOpenApiDocument(), 'utf-8')

      const generated = await readFile(regenerated, 'utf-8')

      let committed: string
      try {
        committed = await readFile(versioned, 'utf-8')
      } catch (error) {
        // Solo el «no existe» se explica como lo que es. Cualquier otro
        // fallo —permisos, un directorio en vez de un fichero— se propaga:
        // esconderlo con un mensaje inventado es peor que un error honesto.
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error
        }

        this.logger.error(
          `El documento OpenAPI versionado no existe: ${versioned}\n` +
            `  Genéralo con \`npm run openapi:generate\` y commitea el fichero.`
        )
        this.exitCode = 1
        return
      }

      if (committed === generated) {
        this.logger.action(`check ${versioned}`).succeeded()
        return
      }

      const originalLines = committed.split('\n')
      const generatedLines = generated.split('\n')

      const changes = diffLines(originalLines, generatedLines)
      const removed = changes.filter((line) => line.kind === '-').length
      const added = changes.filter((line) => line.kind === '+').length

      this.logger.error(
        `El documento OpenAPI versionado no coincide con el que genera el código:\n` +
          `  versionado:  ${versioned}\n` +
          `  ${removed} línea(s) quitadas y ${added} línea(s) añadidas.`
      )

      this.logger.info(formatDiff(originalLines, generatedLines).join('\n'))
      this.logger.info('')
      this.logger.info(
        `Para actualizarlo: \`npm run openapi:generate\`. Este comando no lo reescribe.`
      )

      this.exitCode = 1
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  }
}
