import { BaseCommand } from '@adonisjs/core/ace'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { openapiDocumentPath, renderOpenApiDocument } from '#openapi/document'

/**
 * Escribe el documento OpenAPI en `docs/api/openapi.json`.
 *
 * El comando **reescribe el fichero versionado**, y por eso es el único de
 * los dos que puede hacerlo: `openapi:check` solo compara. La diferencia no
 * es de estilo, es de permisos: generar es escribir, comprobar es no tocar
 * nada.
 *
 * Generar no es un paso opcional del desarrollo: si cambia un controlador, un
 * validador o un transformer, el documento cambia, y el fichero versionado
 * tiene que cambiar con él en el mismo commit. Por eso el comando escribe
 * siempre, sin preguntar: si el documento no ha cambiado, el fichero se
 * escribe igual y el diff sale vacío.
 */
export default class OpenapiGenerate extends BaseCommand {
  static commandName = 'openapi:generate'
  static description = 'Genera el documento OpenAPI y lo escribe en docs/api/openapi.json'

  /**
   * El comando necesita la aplicación arrancada: el documento se construye a
   * partir del router y de los decoradores de los controladores, y sin la
   * aplicación cargada no hay nada que construir.
   */
  static options = { startApp: true }

  async run() {
    const target = openapiDocumentPath()
    const content = await renderOpenApiDocument()

    // El directorio se crea si no existe: en un clon limpio `docs/api/` no
    // está, y el comando tiene que funcionar la primera vez sin pasos extra.
    await mkdir(dirname(target), { recursive: true })

    // La escritura es **atómica**: se escribe primero en un fichero temporal
    // al lado del destino y luego se renombra. Si el comando se corta a mitad,
    // el fichero versionado sigue siendo el anterior y entero, en vez de un
    // JSON truncado que se podría commitear sin que nadie lo note.
    const temporary = `${target}.tmp`
    await writeFile(temporary, content, 'utf-8')
    await rename(temporary, target)

    this.logger.action(`create ${target}`).succeeded()
  }
}
