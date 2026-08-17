import { Readable } from 'node:stream'
import { expect, test } from 'vitest'
import { JSON_BODY_LIMIT, readJson, RequestBodyTooLargeError } from './http.js'

test('reads JSON bodies split across chunks', async () => {
  const request = Readable.from(['{"order":', '["first","second"]}'])

  await expect(readJson(request)).resolves.toEqual({ order: ['first', 'second'] })
})

test('rejects JSON bodies larger than the configured limit', async () => {
  const request = Readable.from([Buffer.alloc(JSON_BODY_LIMIT), Buffer.from('x')])

  await expect(readJson(request)).rejects.toBeInstanceOf(RequestBodyTooLargeError)
})
