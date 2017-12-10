'use strict';
import * as _ from 'lodash';
import { ILogger } from '../helpers';
import { IPeerLogic, IPeersLogic } from '../ioc/interfaces/logic/';
import {ISystemModule} from '../ioc/interfaces/modules';
import { BasePeerType, PeerLogic, PeerState, PeerType } from './peer';

export class PeersLogic implements IPeersLogic {
  private library: { logger: ILogger };

  private peers: { [peerIdentifier: string]: IPeerLogic } = {};

  private modules: { system: ISystemModule };

  constructor(logger: ILogger) {
    this.library = {logger};
  }

  public create(peer: BasePeerType): IPeerLogic {
    if (!(peer instanceof PeerLogic)) {
      return new PeerLogic(peer);
    }
    return peer as any;
  }

  /**
   * Checks if peer is in list
   */
  public exists(peer: BasePeerType): boolean {
    const thePeer = this.create(peer);
    return typeof(this.peers[thePeer.string]) !== 'undefined';
  }

  public get(peer: PeerType | string) {
    if (typeof(peer) === 'string') {
      return this.peers[peer];
    }
    return this.peers[this.create(peer).string];
  }

  public upsert(peer: PeerType, insertOnly: boolean) {

    const thePeer = this.create(peer);
    if (this.exists(thePeer)) {
      if (insertOnly) {
        return false;
      }
      // Update peer.
      thePeer.updated = Date.now();
      const diff      = {};
      Object.keys(peer)
        .filter((k) => k !== 'updated')
        .filter((k) => this.peers[thePeer.string][k] !== thePeer[k])
        .forEach((k: string) => diff[k] = thePeer[k]);

      this.peers[thePeer.string].update(thePeer);

      if (Object.keys(diff).length) {
        this.library.logger.debug(`Updated peer ${thePeer.string}`, diff);
      } else {
        this.library.logger.trace('Peer not changed', thePeer.string);
      }
    } else {
      // insert peer!
      if (!_.isEmpty(this.acceptable([thePeer]))) {
        thePeer.updated            = Date.now();
        this.peers[thePeer.string] = thePeer;
        this.library.logger.debug('Inserted new peer', thePeer.string);
      } else {
        this.library.logger.debug('Rejecting unacceptable peer', thePeer.string);
      }
    }

    const stats = {
      alive         : 0,
      emptyBroadhash: 0,
      emptyHeight   : 0,
      total         : 0,
    };

    Object.keys(this.peers)
      .map((key) => this.peers[key])
      .forEach((p: PeerLogic) => {
        stats.total++;

        if (p.state === PeerState.CONNECTED) {
          stats.alive++;
        }
        if (!p.height) {
          stats.emptyHeight++;
        }
        if (!p.broadhash) {
          stats.emptyBroadhash++;
        }
      });

    this.library.logger.trace('PeerStats', stats);

    return true;

  }

  public remove(peer: BasePeerType): boolean {
    if (this.exists(peer)) {
      const thePeer = this.create(peer);
      this.library.logger.info('Removed peer', thePeer.string);
      this.library.logger.debug('Removed peer', { peer: this.peers[thePeer.string] });
      delete this.peers[thePeer.string];
      return true;
    }

    this.library.logger.debug('Failed to remove peer', { err: 'AREMOVED', peer });
    return false;
  }

  public list(normalize: true): PeerType[];
  public list(normalize: false): IPeerLogic[];
  public list(normalize: boolean) {
    return Object.keys(this.peers)
      .map((k) => this.peers[k])
      .map((peer) => normalize ? peer.object() : peer);
  }

  public bindModules(modules: { system: any }) {
    this.modules = {
      system: modules.system,
    };
  }

  /**
   * Filters peers with private ips or same nonce
   */
  public acceptable(peers: PeerType[]): PeerType[] {
    return _(peers)
      .uniqWith((a, b) => `${a.ip}${a.port}` === `${b.ip}${b.port}`)
      .filter((peer) => {
        if ((process.env.NODE_ENV || '').toUpperCase() === 'TEST') {
          return peer.nonce !== this.modules.system.getNonce() && (peer.os !== 'lisk-js-api');
        }
        return !ip.isPrivate(peer.ip) && peer.nonce !== this.modules.system.getNonce() && (peer.os !== 'lisk-js-api');
      })
      .value();
  }

}
