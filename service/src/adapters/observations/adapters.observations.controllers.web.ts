import express from 'express'
import { mageAppErrorHandler } from '../adapters.controllers.web'
import { AllocateObservationId, ExoObservationMod, ObservationRequest, SaveObservation, SaveObservationRequest } from '../../app.api/observations/app.api.observations'
import { ObservationDocument } from '../../models/observation'
import { EventScopedObservationRepository, ObservationAttrs } from '../../entities/observations/entities.observations'
import mongoose from 'mongoose'
import { docToEntity } from './adapters.observations.db.mongoose'
import { MageEvent, MageEventId } from '../../entities/events/entities.events'


export interface ObservationAppLayer {
  allocateObservationId: AllocateObservationId
  saveObservation: SaveObservation
}

export interface ObservationWebAppRequestFactory {
  <Params extends object>(req: express.Request, params?: Params): Params & ObservationRequest<unknown>
}

export interface EnsureEventScope {
  (eventId: MageEventId): Promise<null | { mageEvent: MageEvent, observationRepository: EventScopedObservationRepository }>
}

export function ObservationRoutes(app: ObservationAppLayer, createAppRequest: ObservationWebAppRequestFactory): express.Router {

  const routes = express.Router().use(express.json())

  routes.route('/id')
    .post(async (req, res, next) => {
      const appReq = createAppRequest(req)
      const appRes = await app.allocateObservationId(appReq)
      const id = appRes.success
      const path = `${req.baseUrl}/${id}`
      if (id) {
        // TODO: add location header? kind of a gray area restfully speaking
        return res.status(201).location(path).json({
          id,
          eventId: appReq.context.mageEvent.id,
          url: `${req.getRoot()}${path}`
        })
      }
      next(appRes.error)
    })

  routes.route('/:observationId')
    .put(async (req, res, next) => {
      const body = req.body
      const observationId = req.params.observationId
      if (body.hasOwnProperty('id') && body.id !== observationId) {
        return res.status(400).json('Body observation ID does not match path observation ID')
      }
      const mod: ExoObservationMod = {
        id: observationId,
        type: 'Feature',
        geometry: req.body.geometry,
        properties: {
          timestamp: new Date(body.properties.timestamp),
          forms: body.properties.forms
        }
      }
      const appReq: SaveObservationRequest = createAppRequest(req, { observation: mod })
      if (body.hasOwnProperty('eventId') && body.eventId !== appReq.context.mageEvent.id) {
        return res.status(400).json('Body event ID does not match path event ID')
      }
      const appRes = await app.saveObservation(appReq)
      if (appRes.success) {
        return res.json(appRes.success)
      }
      next(appRes.error)
    })

  return routes.use(mageAppErrorHandler)
}

export type ObservationJson = {

}

export function jsonForObservation(x: Partial<ObservationAttrs | ObservationDocument>, eventId: MageEventId): ObservationJson {
  const obs = x instanceof mongoose.Document ? docToEntity(x as ObservationDocument, eventId) : x as Partial<ObservationAttrs>
  return obs
}