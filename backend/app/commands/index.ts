import OpenapiCheck from './openapi_check.js'
import OpenapiGenerate from './openapi_generate.js'

/**
 * El cargador de los comandos del proyecto.
 *
 * Ace encuentra los comandos de dos maneras. Una es el directorio `commands/`
 * de la raíz de la aplicación, que se escanea al arrancar. La otra es el
 * array `commands` de `adonisrc.ts`, donde cada entrada es un cargador como
 * este.
 *
 * Estos comandos usan la segunda, y no porque quede mejor, sino porque la
 * primera está rota: al escanear `commands/`, Ace valida los metadatos de
 * cada comando con `jsonschema`, y con la versión instalada (`1.5.0`) esa
 * validación falla con `Invalid URL` antes incluso de mirar el comando —
 * el esquema de Ace no lleva `$id` y la librería no sabe resolver su `$ref`
 * raíz. Con un comando en `commands/`, `node ace list` deja de funcionar
 * entero, no solo ese comando.
 *
 * Por eso los comandos viven en `app/commands/` y se registran aquí. Cuando
 * `jsonschema` se arregle —o Ace añada el `$id` que falta— esto puede volver
 * a ser un fichero suelto en `commands/`, y ni el resto del proyecto se
 * entera.
 *
 * ⚠️ **Aviso para el que llegue después.** `node ace make:command` sigue
 * scaffoldeando en `commands/`, que es justo el directorio que no se puede
 * usar. Si alguien lo ejecuta, el comando nuevo deja `node ace list` sin
 * funcionar para todo el mundo, con un error (`Invalid URL`) que no señala
 * nada de su cambio. Si hace falta un comando nuevo, se escribe en
 * `app/commands/` y se añade a la lista de abajo.
 */

const commands = [OpenapiGenerate, OpenapiCheck]

/**
 * Los metadatos de los comandos, que es lo que Ace necesita para resolver un
 * nombre y mostrar la ayuda.
 */
export async function getMetaData() {
  return commands.map((command) => command.serialize())
}

/**
 * La clase del comando pedido, o `null` si este cargador no lo tiene.
 */
export async function getCommand(metaData: { commandName: string }) {
  return commands.find((command) => command.commandName === metaData.commandName) ?? null
}
