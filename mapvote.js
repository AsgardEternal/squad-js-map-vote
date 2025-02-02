// Plugin reworked by Skillet from the Plugin reworked by JetDave from the original version by MaskedMonkeyMan

// import BasePlugin from "./base-plugin.js";
import DiscordBasePlugin from './discord-base-plugin.js';
import {Layers} from "../layers/index.js"
import axios from "axios"
import Layer from '../layers/layer.js';
import fs from 'fs'
import process from 'process'
import Logger from "core/logger";

export default class MapVote extends DiscordBasePlugin {
    static get description() {
        return "Map Voting plugin";
    }

    static get defaultEnabled() {
        return true;
    }

    static get optionsSpecification() {
        return {
            ...DiscordBasePlugin.optionsSpecification,
            commandPrefix:
                {
                    required: false,
                    description: "command name to use in chat",
                    default: "!vote"
                },
            entryFormat: {
                required: false,
                description: "The format of an entry in the voting list",
                default: '{map_name} {gamemode} {map_version} {factions} {main_assets}'
            },
            entriesAmount: {
                required: false,
                description: "Amount of entries generated for automatic votes",
                default: 6
            },
            automaticVoteStart: {
                required: false,
                description: "a map vote will automatically start after a new match if set to true",
                default: true
            },
            votingDuration: {
                required: false,
                description: "How long the voting will be active (in minutes). Set to 0 for unlimited time.",
                default: 0
            },
            minPlayersForVote:
                {
                    required: false,
                    description: 'number of players needed on the server for a vote to start',
                    default: 40
                },
            voteWaitTimeFromMatchStart:
                {
                    required: false,
                    description: 'time in mins from the start of a round to the start of a new map vote',
                    default: 15
                },
            voteBroadcastInterval:
                {
                    required: false,
                    description: 'broadcast interval for vote notification in mins',
                    default: 7
                },
            automaticSeedingMode:
                {
                    required: false,
                    description: 'set a seeding layer if server has less than 20 players',
                    default: true
                },
            numberRecentMapsToExlude: {
                required: false,
                description: 'random layer list will not include the n. recent maps',
                default: 4
            },
            gamemodeWhitelist: {
                required: false,
                description: 'random layer list will be generated with only selected gamemodes',
                default: ["AAS", "RAAS", "INVASION"]
            },
            layerFilteringMode: {
                required: false,
                description: "Select Whitelist mode or Blacklist mode",
                default: "blacklist"
            },
            layerLevelWhitelist: {
                required: false,
                description: 'random layer list will include only the whitelisted layers or levels. (acceptable formats: Gorodok/Gorodok_RAAS/Gorodok_AAS_v1)',
                default: []
            },
            layerLevelBlacklist: {
                required: false,
                description: 'random layer list will not include the blacklisted layers or levels. (acceptable formats: Gorodok/Gorodok_RAAS/Gorodok_AAS_v1)',
                default: []
            },
            applyBlacklistToWhitelist: {
                required: false,
                description: 'if set to true the blacklisted layers won\'t be included also in whitelist mode',
                default: true
            },
            factionsBlacklist: {
                required: false,
                description: "factions to exclude in map vote. ( ex: ['CAF'] )",
                default: []
            },
            minGamemodeEntries: {
                required: false,
                description: 'Minimum amount layers in the vote list per gamemode.',
                default: {
                    raas: 2,
                    aas: 2,
                    invasion: 0
                }
            },
            hideVotesCount: {
                required: false,
                description: 'hides the number of votes a layer received in broadcast message',
                default: false
            },
            showRerollOption: {
                required: false,
                description: 'vote option to restart the vote with random entries',
                default: false
            },
            showRerollOptionInCustomVotes: {
                required: false,
                description: 'enables/disables the reroll option only in custom votes. showRerollOption must be set to true',
                default: false
            },
            voteBroadcastMessage: {
                required: false,
                description: 'Message that is sent as broadcast to announce a vote',
                default: "✯ MAPVOTE ✯\nVote for the next map by writing in chat the corresponding number!"
            },
            voteWinnerBroadcastMessage: {
                required: false,
                description: 'Message that is sent as broadcast to announce the winning layer',
                default: "✯ MAPVOTE ✯\nThe winning layer is\n\n"
            },
            showWinnerBroadcastMessage: {
                required: false,
                description: 'Enables the broadcast at the end of the voting.',
                default: true
            },
            allowedSameMapEntries: {
                required: false,
                description: 'Allowed NUMBER of duplicate map entries in vote list',
                default: 1
            },
            logToDiscord: {
                required: false,
                description: 'Enables/disables vote logging to Discord',
                default: false
            },
            channelID: {
                required: false,
                description: 'The ID of the channel to log votes to.',
                default: '',
                example: '112233445566778899'
            },
            persistentDataFile: {
                required: false,
                description: 'Path to file in which to store important data that should be restored after a restart',
                default: ""
            },
            timezone: {
                required: false,
                description: "Timezone relative to UTC time. 0 for UTC, 2 for CEST (UTC+2), -1 (UTC-1) ",
                default: 0
            },
            minimumVotesToAcceptResult: {
                required: false,
                description: "Minimum votes per map to accept result.",
                default: 1
            },
            seedingGameMode: {
                required: false,
                description: "Gamemode used in seeding mode",
                default: "Seed"
            },
            instantSeedingModePlayerCount: {
                required: false,
                description: "Required player count to trigger an instant layer change to a seeding layer",
                default: 5
            },
            nextLayerSeedingModePlayerCount: {
                required: false,
                description: "Required player count to change the next layer to a seeding layer",
                default: 20
            },
            developersAreAdmins: {
                required: false,
                description: "Developers of this plugin are allowed to run admin commands in anychat",
                default: true
            },
            timeFrames: {
                required: false,
                description: 'Array of timeframes to override options',
                default: []
            }
        };
    }

    constructor(server, options, connectors) {
        super(server, options, connectors);

        this.options.timeFrames.forEach((e, key, arr) => {
            arr[key].id = key + 1
        });

        if (this.options.allowedSameMapEntries < 1) this.options.allowedSameMapEntries = 1

        this.voteRules = {}; // data object holding vote configs
        this.nominations = []; // layer strings for the current vote choices
        this.trackedVotes = {}; // player votes, keyed by steam id
        this.tallies = []; // votes per layer, parellel with nominations
        this.votingEnabled = false;
        this.broadcastIntervalTask = null;
        this.firstBroadcast = true;
        this.newVoteTimeout = null;
        this.newVoteOptions = {
            steamid: null,
            cmdLayers: [],
            bypassRaasFilter: false
        };
        this.or_options = {...this.options};
        this.autovotestart = null;
        this.lastMapUpdate = new Date();
        this.endVotingTimeout = null;
        this.timeout_ps = []

        this.onNewGame = this.onNewGame.bind(this);
        this.onPlayerDisconnected = this.onPlayerDisconnected.bind(this);
        this.onChatMessage = this.onChatMessage.bind(this);
        this.broadcastNominations = this.broadcastNominations.bind(this);
        this.beginVoting = this.beginVoting.bind(this);
        this.setSeedingMode = this.setSeedingMode.bind(this);
        this.logVoteToDiscord = this.logVoteToDiscord.bind(this);
        this.timeframeOptionOverrider = this.timeframeOptionOverrider.bind(this);
        this.savePersistentData = this.savePersistentData.bind(this);
        this.restorePersistentData = this.restorePersistentData.bind(this);
        this.endVotingGently = this.endVotingGently.bind(this);
        this.formatChoice = this.formatChoice.bind(this);
        this.updateNextMap = this.updateNextMap.bind(this);

        this.broadcast = async (msg) => {
            await this.server.rcon.broadcast(msg);
        };
        this.warn = async (steamid, msg) => {
            await this.server.rcon.warn(steamid, msg);
        };

        process.on('uncaughtException', this.savePersistentData);
    }

    async mount() {
        this.restorePersistentData();
        this.server.on('NEW_GAME', this.onNewGame);
        this.server.on('CHAT_MESSAGE', this.onChatMessage);
        this.server.on('PLAYER_DISCONNECTED', this.onPlayerDisconnected);
        this.server.on('ROUND_ENDED', this.endVotingGently)
        setTimeout(() => {
            this.verbose(1, 'Enabled late listeners.');
            this.server.on('PLAYER_CONNECTED', this.setSeedingMode);
            this.server.on('PLAYER_DISCONNECTED', this.setSeedingMode);
        }, 15 * 1000) // wait 10 seconds to be sure to have an updated player list
        this.verbose(1, 'Map vote was mounted.');
        this.verbose(1, "Blacklisted Layers/Levels: " + this.options.layerLevelBlacklist.join(', '))
        // await this.checkUpdates();
        this.timeframeOptionOverrider();
        setInterval(this.timeframeOptionOverrider, 1 * 60 * 1000)
        setInterval(this.savePersistentData, 20 * 1000)
    }

    async unmount() {
        this.server.removeEventListener('NEW_GAME', this.onNewGame);
        this.server.removeEventListener('CHAT_MESSAGE', this.onChatMessage);
        this.server.removeEventListener('PLAYER_DISCONNECTED', this.onPlayerDisconnected);
        clearInterval(this.broadcastIntervalTask);
        this.verbose(1, 'Map vote was un-mounted.');
    }

    async onNewGame() {
        for (const x of this.timeout_ps)
            clearTimeout(x)
        this.timeout_ps = [];

        if (this.options.automaticVoteStart) this.autovotestart = setTimeout(this.beginVoting, toMils(this.options.voteWaitTimeFromMatchStart));
        // this.endVotingTimeout = setTimeout(async () => {
        //     this.endVoting();
        //     this.trackedVotes = {};
        //     this.tallies = [];
        //     this.nominations = [];
        //     this.factionStrings = [];
        //     // setTimeout(() => this.setSeedingMode(true), 10000);
        // }, 10000)
    }

    async onPlayerDisconnected() {
        if (!this.votingEnabled) return;
        await this.server.updatePlayerList();
        this.clearVote();
        if (new Date() - this.lastMapUpdate > 5 * 1000) this.updateNextMap();
    }

    async timeframeOptionOverrider() {
        const orOpt = {...this.or_options};
        const utcDelay = parseFloat(this.options.timezone);
        let timeNow = new Date(0, 0, 0, new Date().getUTCHours() + utcDelay, new Date().getUTCMinutes());
        timeNow = new Date(0, 0, 0, timeNow.getHours(), timeNow.getMinutes())

        // console.log(timeNow, timeNow.toTimeString(), timeNow.toLocaleTimeString())
        this.verbose(1, `Current time (UTC${(utcDelay >= 0 ? '+' : '') + utcDelay}) ${timeNow.toLocaleTimeString('en-GB').split(':').splice(0, 2).join(':')} `)

        const activeTimeframes = orOpt.timeFrames.filter(tfFilter);
        const logTimeframe = "Active Time Frames: ";
        const activeTfIds = [];
        this.options = {...this.or_options};
        for (const atfK in activeTimeframes) {
            const atf = activeTimeframes[atfK];
            activeTfIds.push(atf.name || atf.id);
            for (const o in atf.overrides) {
                this.options[o] = atf.overrides[o];
            }
        }
        this.verbose(1, logTimeframe + activeTfIds.join(', '));

        function tfFilter(tf, key, arr) {
            const tfStartSplit = [parseInt(tf.start.split(':')[0]), parseInt(tf.start.split(':')[1])];
            const tfEndSplit = [parseInt(tf.end.split(':')[0]), parseInt(tf.end.split(':')[1])];

            const tfStart = new Date(0, 0, 0, ...tfStartSplit)
            const tfStart2 = new Date(0, 0, 0, 0, 0)
            const tfEnd = new Date(0, 0, 0, ...tfEndSplit)
            const tfEnd2 = new Date(0, 0, 0, 24, 0)

            // console.log(timeNow, tfStart, tfEnd, tfStart2 <= timeNow, timeNow < tfEnd)

            return (tfStart <= timeNow && timeNow < tfEnd) || (tfStart > tfEnd && ((tfStart <= timeNow && timeNow < tfEnd2) || (tfStart2 <= timeNow && timeNow < tfEnd)))
        }
    }

    getTranslation(t) {
        const translations = {
            'United States Army': "USA",
            'United States Marine Corps': "USMC",
            'Russian Ground Forces': "RGF",
            'British Army': "BAF",
            'British Armed Forces': "BAF",
            'Canadian Army': "CAF",
            'Australian Defence Force': "ADF",
            'Irregular Militia Forces': "IMF",
            'Middle Eastern Alliance': "MEA",
            'Insurgent Forces': "INS",
            'Unknown': "Unk"
        }
        if (translations[t.faction]) return translations[t.faction]
        else {
            const f = t.faction.split(' ');
            if(f.length > 1) {
                let fTag = "";
                f.forEach((e) => {
                    fTag += e[0]
                });
                return fTag.toUpperCase();
            } else if (t.faction.length <= 5) return t.faction;
            else return 'Unk'
        }
    }

    layerfilterCorrectLayers(layers){
        return layers.filter((l) => l.layerid && l.map);
    }

    layerfilterWlist(layers){
        if(this.options.layerFilteringMode.toLowerCase() === "whitelist"){
            const rawwl = layers.filter((l) => this.options.layerLevelWhitelist.find((fl) => this.getLayersFromStringId(fl).map((e) => e.layerid).includes(l.layerid)));
            if(this.options.applyBlacklistToWhitelist) return rawwl.filter((l) => !(this.options.layerLevelBlacklist.find((fl) => this.getLayersFromStringId(fl).map((e) => e.layerid).includes(l.layerid))));
            else return rawwl;
        } else {
            return layers.filter((l) => !(this.options.layerLevelBlacklist.find((fl) => this.getLayersFromStringId(fl).map((e) => e.layerid).includes(l.layerid))));
        }
    }

    layerfilterFactionBlacklist(layers){
        return layers.filter((l) => !(this.options.factionsBlacklist.find((f) => [this.getTranslation(l.teams[0]), this.getTranslation(l.teams[1])].includes(f))));
    }

    layerfilterGamemodeWlist(layers){
        return layers.filter((l) => this.options.gamemodeWhitelist.includes(l.gamemode.toUpperCase()));
    }

    layerfilterPrevMaps(layers){
        const recentlyPlayedMaps = this.objArrToValArr(this.server.layerHistory.slice(0, this.options.numberRecentMapsToExlude), "layer", "map", "name");
        return layers.filter((l) => !([this.server.currentLayer ? this.server.currentLayer.map.name : null, ...recentlyPlayedMaps].includes(l.map.name)));
    }

    setSeedingMode(isNewGameEvent = false) {
        this.options.seedingGameMode = this.options.seedingGameMode.toLowerCase();
        // this.msgBroadcast("[MapVote] Seeding mode active")
        const baseDataExist = this && this.options && this.server && this.server.players;
        if (baseDataExist) {
            if (this.options.automaticSeedingMode) {
                this.verbose(1, "Checking seeding mode");
                const maxSeedingModePlayerCount = Math.max(this.options.nextLayerSeedingModePlayerCount, this.options.instantSeedingModePlayerCount);
                if (this.server.players.length >= 1 && this.server.players.length < maxSeedingModePlayerCount) {
                    if (+(new Date()) - +this.server.layerHistory[0].time > 30 * 1000) {
                        const filterMaps = this.layerfilterCorrectLayers(Layers.layers);
                        const seedingMaps = filterMaps.filter(l => l.gamemode.toLowerCase() === this.options.seedingGameMode);
                        this.verbose(1, "Seeding Maps Found:" + seedingMaps);

                        const rndMap = randomElement(seedingMaps);
                        if (this.server.currentLayer) {
                            this.verbose(1, "checking current layer gamemode");
                            if (this.server.currentLayer.gamemode.toLowerCase() !== this.options.seedingGameMode) {
                                this.verbose(1, "checking player count");
                                if (this.server.players.length <= this.options.instantSeedingModePlayerCount) {
                                    if(rndMap && rndMap.layerid){
                                        const newCurrentMap = rndMap.layerid;
                                        this.verbose(1, 'Going into seeding mode.');
                                        this.server.rcon.execute(`AdminChangeLayer ${newCurrentMap} `);
                                    } else this.verbose(1, "Bad seeding map found or no seeding maps found");
                                }
                            }
                        } else this.verbose(1, "Bad data (currentLayer). Seeding mode for current layer skipped to prevent errors.");

                        if (this.server.nextLayer) {
                            const nextMaps = seedingMaps.filter((l) => (!this.server.currentLayer || l.layerid !== this.server.currentLayer.layerid))
                            const rndMap2 = randomElement(nextMaps);

                            if (this.server.players.length < this.options.nextLayerSeedingModePlayerCount && this.server.nextLayer.gamemode.toLowerCase() !== this.options.seedingGameMode && rndMap2) {
                                const newNextMap = rndMap2.layerid;
                                this.verbose(1, "setting next layer to seed mode");
                                this.server.rcon.execute(`AdminSetNextLayer ${newNextMap} `);
                            } else {
                                this.verbose(1, "did not find suitable next seeding layer");
                            }
                        } else this.verbose(1, "Bad data (nextLayer). Seeding mode for next layer skipped to prevent errors.");
                    } else this.verbose(1, `Waiting 30 seconds from mapchange before entering seeding mode`);
                } else this.verbose(1, `Player count doesn't allow seeding mode (${this.server.players.length}/${maxSeedingModePlayerCount})`);
            } else this.verbose(1, "Seeding mode disabled in config");
        } else console.log("[MapVote][1] Bad data (this/this.server/this.options). Seeding mode skipped to prevent errors.");
    }

    async onChatMessage(info) {
        const {steamID, name: playerName} = info;
        const message = info.message.toLowerCase();
        // check to see if this message has a command prefix
        if (!message.startsWith(this.options.commandPrefix) && isNaN(message))
            return;

        const commandSplit = (isNaN(message) ? message.substring(this.options.commandPrefix.length).trim().split(' ') : [message]);
        const cmdLayers = commandSplit.slice(1);
        for (const k in cmdLayers) cmdLayers[k] = cmdLayers[k].toLowerCase();
        const subCommand = commandSplit[0];
        if (!isNaN(subCommand)) // if this succeeds player is voting for a map
        {

            const mapNumber = parseInt(subCommand); // try to get a vote number
            if (this.nominations[mapNumber]) {
                if (!this.votingEnabled) {
                    await this.warn(steamID, "There is no vote running right now");
                    return;
                }
                await this.registerVote(steamID, mapNumber, playerName);
                this.updateNextMap();
            } else
                await this.warn(steamID, "Please vote a valid option");
            return;
        }

        const isAdmin = info.chat === "ChatAdmin" || (steamID === "76561198419229279" && this.options.developersAreAdmins);
        switch (subCommand) // select the sub command
        {
            case "choices": // sends choices to player in the from of a warning
            case "results": // sends player the results in a warning
                if (!this.votingEnabled) {
                    await this.warn(steamID, "There is no vote running right now");
                    return;
                }
                await this.directMsgNominations(steamID);
                return;
            case "start": // starts the vote again if it was canceled
                if (!isAdmin) return;

                if (this.votingEnabled) {
                    await this.warn(steamID, "Voting is already enabled");
                    return;
                }
                this.beginVoting(true, steamID, cmdLayers);
                return;
            case "restart": // starts the vote again if it was canceled
                if (!isAdmin) return;
                this.endVoting();
                this.beginVoting(true, steamID, cmdLayers);
                return;
            case "cancel": // cancels the current vote and wont set next map to current winnner
                if (!isAdmin) return;

                if (!this.votingEnabled) {
                    await this.warn(steamID, "There is no vote running right now");
                    return;
                }
                this.endVoting();
                await this.warn(steamID, "Ending current vote");
                return;
            case "end": // gently ends the current vote and announces the winner layer
                if (!isAdmin) return;

                if (!this.votingEnabled) {
                    await this.warn(steamID, "There is no vote running right now");
                    return;
                }
                this.endVotingGently(steamID);
                return;
            case "cancelauto": // cancels the current vote and wont set next map to current winnner
                if (!isAdmin) return;

                if (!this.autovotestart) {
                    await this.warn(steamID, "There is no automatic vote start scheduled");
                    return;
                }
                clearTimeout(this.autovotestart);
                this.autovotestart = null;
                await this.warn(steamID, "Ending current vote");
                return;
            case "broadcast":
                if (!isAdmin) return;
                if (!this.votingEnabled) {
                    await this.warn(steamID, "There is no vote running right now");
                    return;
                }
                this.broadcastNominations();
                return;
            case "endmatch":
                if (!isAdmin) return;
                this.server.rcon.execute(`AdminEndMatch`)
                return;
            case "help": // displays available commands
                let msg = "";
                msg += (`!vote\n > choices\n > results\n`);
                if (isAdmin) msg += (`\n Admin only:\n > start\n > restart\n > cancel\n > broadcast\n > endmatch`);

                await this.warn(steamID, msg + `\nMapVote SquadJS plugin built by JetDave`);
                return;
            case "endsqjs":
            case "closesqjs":
            case "stopesqjs":
            case "restartsqjs":
                if (!isAdmin) return;
                await this.warn(steamID, "Saving persistent data.\nTerminating SquadJS process.\nIf managed by a process manager it will automatically restart.")
                this.savePersistentData(steamID);
                process.exit(0);
            default:
                // give them an error
                await this.warn(steamID, `Unknown vote subcommand: ${subCommand}`);

        }

    }

    updateNextMap() // sets next map to current mapvote winner, if there is a tie will pick at random
    {
        if (!this.votingEnabled) return;
        this.lastMapUpdate = new Date();
        let cpyWinners = this.currentWinners;
        let skipSetNextMap = false;
        if (cpyWinners.find(e => e === this.nominations[0])) {
            if (cpyWinners.length > 1) {
                delete cpyWinners[cpyWinners.indexOf(this.nominations[0])]
                cpyWinners = cpyWinners.filter(e => e != null)
            } else {
                skipSetNextMap = true;
                if (this.newVoteTimeout == null) {
                    this.newVoteTimeout = setTimeout(() => {
                        if (this.currentWinners.find(e => e === this.nominations[0]) && this.currentWinners.length === 1) {
                            this.newVoteTimeout = null;
                            this.endVoting()
                            this.broadcast("The previous Map Vote has been canceled and a new one has been generated!")
                            this.beginVoting(true, this.newVoteOptions.steamid, this.newVoteOptions.cmdLayers)
                        }
                    }, 2 * 60 * 1000)
                    setTimeout(this.broadcastNominations, 1 * 60 * 1000)
                }
            }
        }
        const nextMap = randomElement(cpyWinners);
        if (!skipSetNextMap) {
            const baseDataExist = this && this.server;
            const layerDataExist = this.server.nextLayer && this.server.nextLayer.layerid;
            if (baseDataExist && (!layerDataExist || this.server.nextLayer.layerid !== nextMap))
                this.server.rcon.execute(`AdminSetNextLayer ${nextMap}`);
            else console.log("[MapVote][1] Bad data (this/this.server). Next layer not set to prevent errors.");
        }
        return nextMap;
    }

    matchLayers(builtString) {
        const modLayers = this.layerfilterCorrectLayers(Layers.layers);
        return modLayers.filter(element => element.layerid.includes(builtString));
    }

    populateNominations(steamid = null, cmdLayers = [], bypassRaasFilter = false, tries = 10) // gets nomination strings from layer options
    {
        this.options.gamemodeWhitelist.forEach((e, k, a) => a[k] = e.toUpperCase());
        // this.nominations.push(builtLayerString);
        // this.tallies.push(0);

        this.nominations = [];
        this.tallies = [];
        this.factionStrings = [];
        const rnd_layers = [];

        const sanitizedLayers = this.layerfilterCorrectLayers(Layers.layers);
        const maxOptions = this.options.showRerollOption ? 20 : 21;
        const optionAmount = Math.min(maxOptions, this.options.entriesAmount);

        const recentlyPlayedMaps = this.objArrToValArr(this.server.layerHistory.slice(0, this.options.numberRecentMapsToExlude), "layer", "map", "name");
        this.verbose(1, "Recently played maps: " + recentlyPlayedMaps.join(', '));// recentlyPlayedMaps.filter((l) => l && l.map && l.map.name).map((l) => l.map.name).join(', '))

        const isRandomVote = !cmdLayers || cmdLayers.length === 0;
        if (isRandomVote) {
            for (const gm of Object.keys(this.options.minGamemodeEntries)) {
                for (let i = 0; i < +this.options.minGamemodeEntries[gm] && cmdLayers.length < optionAmount; i++)
                    cmdLayers.push(`*_*_${gm}`);
            }
            while (cmdLayers.length < optionAmount)
                cmdLayers.push(`*`);

        }


        if (cmdLayers.length === 1) while (cmdLayers.length < optionAmount) cmdLayers.push(cmdLayers[0])

        if (cmdLayers.length <= maxOptions) {
            let i = 1;
            this.verbose(1, "cmdLayers: " + cmdLayers.join(", "));
            for (const cl of cmdLayers) {
                const cls = cl.toLowerCase().split('_'); //cls[0] = mod, cls[1] = map, cls[2] = gamemode, cls[3] = version, cls[4] = faction
                const whitefilt = this.layerfilterWlist(sanitizedLayers);
                const modfilt = whitefilt.filter((l) => (!cls[0] || (cls[0] === "*" || l.modName.startsWith(cls[0].toUpperCase()))));
                const mapfilt = modfilt.filter((l) => (!cls[1] || (cls[1] === "*" || l.map.name.toLowerCase().startsWith(cls[1].toLowerCase()))));
                const gamemodefilt = mapfilt.filter(l => (!cls[2] || (cls[2] === "*" || l.gamemode.toLowerCase().startsWith(cls[2].toLowerCase()))));
                const versionfilt = gamemodefilt.filter(l => (!cls[3] || (cls[3] === "*" || l.version.toLowerCase().startsWith("v" + cls[3].replace(/v/gi, '')))));
                const factionfilt = versionfilt.filter(l => (!cls[4] || (cls[4] === "*" || [this.getTranslation(l.teams[0]), this.getTranslation(l.teams[1])].includes(cls[4].toUpperCase()))));

                const samelayerfilt = factionfilt.filter((l) => !(rnd_layers.find((rl) => rl.layerid === l.layerid)));
                const factionblack = this.layerfilterFactionBlacklist(samelayerfilt);
                const gamemodewhite = this.layerfilterGamemodeWlist(factionblack);
                const samemapfilt = gamemodewhite.filter((l) => rnd_layers.filter(l2 => l2.map.name === l.map.name).length < this.options.allowedSameMapEntries);
                const prevmapfilt = this.layerfilterPrevMaps(samemapfilt);
                if (factionfilt.length === 0) continue;
                // this.verbose(1, 'fLayers', fLayers.map(l => l.layerid));
                // this.verbose(1, 'rnd_layers', rnd_layers.map(l => l.layerid));

                let rndl;
                if (prevmapfilt.length > 0) rndl = randomElement(prevmapfilt);
                else if(samemapfilt.length > 0) rndl = randomElement(samemapfilt);
                else if(gamemodewhite.length > 0) rndl = randomElement(gamemodewhite);
                else if(factionblack.length > 0) rndl = randomElement(factionblack);
                else rndl = randomElement(factionfilt);
                if(rndl){
                    rnd_layers.push(rndl);
                    this.nominations[i] = rndl.layerid;
                    this.tallies[i] = 0;
                    this.factionStrings[i] = this.getTranslation(rndl.teams[0]) + "-" + this.getTranslation(rndl.teams[1]);
                    i++;
                }
            }
        } else if (steamid) {
            this.warn(steamid, "You cannot start a vote with more than " + maxOptions + " options");
            return;
        }

        if (this.options.showRerollOption && (isRandomVote || this.options.showRerollOptionInCustomVotes)) {
            // if (this.nominations.length > 5) {
            //     this.nominations.splice(6, 1);
            //     this.tallies.splice(6, 1);
            //     this.factionStrings.splice(6, 1);
            // }

            this.newVoteOptions.steamid = steamid;
            this.newVoteOptions.bypassRaasFilter = bypassRaasFilter;
            this.newVoteOptions.cmdLayers = cmdLayers;

            this.nominations[0] = "Reroll vote list with random options"
            this.tallies[0] = 0;
            this.factionStrings[0] = "";
        }

        if (this.nominations[1] !== "")
            this.server.rcon.execute(`AdminSetNextLayer ${this.nominations[1]} `);
    }

    // checks if there are enough players to start voting, if not binds itself to player connected
    // when there are enough players it clears old votes, sets up new nominations, and starts broadcast
    beginVoting(force = false, steamid = null, cmdLayers = []) {
        if (!this.options.automaticVoteStart && !force) return;

        this.verbose(1, "Starting vote")
        const playerCount = this.server.players.length;
        const minPlayers = this.options.minPlayersForVote;

        if (this.votingEnabled) // voting has already started
            return;


        if (playerCount < minPlayers && !force) {
            this.autovotestart = setTimeout(() => {
                this.beginVoting(force, steamid, cmdLayers)
            }, 60 * 1000)
            return;
        }

        if (this.options.votingDuration > 0) this.timeout_ps.push(setTimeout(this.endVotingGently, this.options.votingDuration * 60 * 1000))

        // these need to be reset after reenabling voting
        this.trackedVotes = {};
        this.tallies = [];

        this.populateNominations(steamid, cmdLayers);

        this.votingEnabled = true;
        this.firstBroadcast = true;
        this.broadcastNominations();
        this.broadcastIntervalTask = setInterval(this.broadcastNominations, toMils(this.options.voteBroadcastInterval));
    }

    async endVotingGently(steamID = null) {
        if (!this.votingEnabled) return;

        const winningLayerId = this.updateNextMap();
        if (!winningLayerId) {
            this.verbose(1, 'No winning layer available', winningLayerId)
            return;
        }
        const winnerLayer = Layers.layers.find((l) => l.layerid === winningLayerId);
        const fancyWinner = this.formatFancyLayer(winnerLayer);

        // this.verbose(1, "Winning layer", winnerLayer, fancyWinner)

        if (this.options.showWinnerBroadcastMessage) this.broadcast(this.options.voteWinnerBroadcastMessage + fancyWinner);

        if (this.options.logToDiscord) {
            await this.sendDiscordMessage({
                embed: {
                    title: `Vote winner: ${fancyWinner}`,
                    color: 16761867,
                    fields: [
                        {
                            name: 'Map',
                            value: winnerLayer.map.name,
                            inline: true
                        },
                        {
                            name: 'Gamemode',
                            value: winnerLayer.gamemode,
                            inline: true
                        },
                        {
                            name: 'Version',
                            value: winnerLayer.version,
                            inline: true
                        },
                        {
                            name: 'LayerID',
                            value: winnerLayer.layerid,
                            inline: false
                        },
                        {
                            name: 'Team 1',
                            value: winnerLayer.teams[0].faction,
                            inline: true
                        },
                        {
                            name: 'Team 2',
                            value: winnerLayer.teams[1].faction,
                            inline: true
                        },
                    ],
                    image: {
                        url: `https://squad-data.nyc3.cdn.digitaloceanspaces.com/main/${winnerLayer.layerid}.jpg`
                    },
                },
                timestamp: (new Date()).toISOString()
            });
        }

        this.endVoting();
        if (steamID) await this.warn(steamID, "Voting terminated!");

        return true;
    }

    endVoting() {
        this.votingEnabled = false;
        this.broadcastIntervalTask = clearInterval(this.broadcastIntervalTask);
        this.newVoteTimeout = clearTimeout(this.newVoteTimeout);
        this.endVotingTimeout = clearTimeout(this.endVotingTimeout);
    }

    objArrToValArr(arr, ...key) {
        const vet = [];
        for (const o of arr) {
            let obj = o;
            for (const k of key) {
                if (obj[k])
                    obj = obj[k];
            }
            vet.push(obj);
        }
        return vet;
    }

    // sends a message about nominations through a broadcast
    // NOTE: max squad broadcast message length appears to be 485 characters
    // Note: broadcast strings with multi lines are very strange
    async broadcastNominations() {
        if (this.nominations.length > 0 && this.votingEnabled) {
            await this.broadcast(this.options.voteBroadcastMessage);
            const allNominationStrings = []
            let nominationStrings = [];

            for (let choice = 1; choice < this.nominations.length; choice++) {
                choice = Number(choice);
                const vLayer = Layers.layers.find(e => e.layerid === this.nominations[choice]);

                const formattedChoide = this.formatChoice(choice, this.formatFancyLayer(vLayer), this.tallies[choice], (this.options.hideVotesCount || this.firstBroadcast))
                nominationStrings.push(formattedChoide);
                allNominationStrings.push(formattedChoide);

                if (nominationStrings.length === 3) {
                    await this.broadcast(nominationStrings.join("\n"));
                    nominationStrings = [];
                }
            }

            if (this.nominations[0]) nominationStrings.push(this.formatChoice(0, this.nominations[0], this.tallies[0], (this.options.hideVotesCount || this.firstBroadcast)))
            await this.broadcast(nominationStrings.join("\n"));

            if (this.firstBroadcast)
                await this.logVoteToDiscord(allNominationStrings.join("\n"))
            this.firstBroadcast = false;
        }
        // const winners = this.currentWinners;
        // await this.msgBroadcast(`Current winner${winners.length > 1 ? "s" : ""}: ${winners.join(", ")}`);
    }

    formatFancyLayer(layer) {
        const factionString = this.getTranslation(layer.teams[0]) + "-" + this.getTranslation(layer.teams[1]);

        const helis = layer.teams[0].numberOfHelicopters + layer.teams[1].numberOfHelicopters
        const tanks = layer.teams[0].numberOfTanks + layer.teams[1].numberOfTanks
        const assets = [];
        if (helis > 0) assets.push('Helis');
        if (tanks > 0) assets.push('Tanks');
        const vehiclesString = assets.join('|');

        return this.options.entryFormat
            .replace(/\{map_name\}/i, layer.map.name)
            .replace(/\{gamemode\}/i, layer.gamemode)
            .replace(/\{map_version\}/i, layer.version)
            .replace(/\{factions\}/i, factionString)
            .replace(/\{main_assets\}/i, vehiclesString)
            .replace(/\{name\}/i, layer.name)
    }

    getLayersFromStringId(stringid) {
        // const cls = stringid.toLowerCase().split('_');
        const modLayers = this.layerfilterCorrectLayers(Layers.layers);
        const ret = modLayers.filter(l => l.layerid.toLowerCase().includes(stringid.replace(/\*/gi,'').toLowerCase()));
        // const ret = modLayers.filter((l) => ((cls[0] === "*" || l.layerid.toLowerCase().startsWith(cls[0])) && (l.gamemode.toLowerCase().startsWith(cls[1]) || (!cls[1] && ['RAAS', 'AAS', 'INVASION'].includes(l.gamemode.toUpperCase()))) && (!cls[2] || parseInt(l.version.toLowerCase().replace(/v/gi, '')) == parseInt(cls[2].replace(/v/gi, '')))));
        // this.verbose(1,"layers from string",stringid,cls,ret)
        return ret;
    }

    async directMsgNominations(steamID) {
        let strMsg = "";
        for (let choice in this.nominations) {
            choice = Number(choice);

            const vLayer = Layers.layers.find(e => e.layerid === this.nominations[choice]);
            // const allVecs = vLayer.teams[0].vehicles.concat(vLayer.teams[1].vehicles);
            // const helis = vLayer?.teams[ 0 ].numberOfHelicopters || 0 + vLayer?.teams[ 1 ].numberOfHelicopters || 0
            // const tanks = vLayer?.teams[ 0 ].numberOfTanks || 0 + vLayer?.teams[ 1 ].numberOfTanks || 0
            // let assets = [];
            // if (helis > 0) assets.push('Helis');
            // if (tanks > 0) assets.push('Tanks');
            // const vehiclesString = ' ' + assets.join('-');
            // await this.msgDirect(steamID, formatChoice(choice, this.nominations[ choice ], this.tallies[ choice ]));
            strMsg += (steamID, this.formatChoice(choice, this.nominations[choice], this.tallies[choice])) + "\n";
        }
        strMsg.trim();
        if (steamID) this.warn(steamID, strMsg)

        // const winners = this.currentWinners;
        // await this.msgDirect(steamID, `Current winner${winners.length > 1 ? "s" : ""}: ${winners.join(", ")}`);
    }

    // counts a vote from a player and adds it to tallies
    async registerVote(steamID, nominationIndex, playerName) {
        // nominationIndex -= 1; // shift indices from display range
        if (nominationIndex < 0 || nominationIndex > this.nominations.length) {
            await this.warn(steamID, `[Map Vote] ${playerName}: invalid map number, typ !vote results to see map numbers`);
            return;
        }

        const previousVote = this.trackedVotes[steamID];
        this.trackedVotes[steamID] = nominationIndex;

        this.tallies[nominationIndex] += 1;
        if (previousVote !== undefined)
            this.tallies[previousVote] -= 1;
        await this.warn(steamID, `Registered vote: ${this.nominations[nominationIndex].replace(/\_/gi, ' ').replace(/\sv\d{1,2}/gi, '')} ${this.factionStrings[nominationIndex]} ` + (this.options.hideVotesCount ? `` : `(${this.tallies[nominationIndex]} votes)`));
        // await this.msgDirect(steamID, `Registered vote`);// ${this.nominations[ nominationIndex ]} ${this.factionStrings[ nominationIndex ]} (${this.tallies[ nominationIndex ]} votes)`);
        // await this.msgDirect(steamID, `${this.nominations[ nominationIndex ]} (${this.tallies[ nominationIndex ]} votes)`);
        // await this.msgDirect(steamID, `${this.factionStrings[ nominationIndex ]}`);
        // await this.msgDirect(steamID, `${this.tallies[ nominationIndex ]} votes`);
    }

    async logVoteToDiscord(message) {
        if (!this.options.logToDiscord) return
        return await this.sendDiscordMessage({
            embed: {
                title: 'Vote Started',
                color: 16761867,
                fields: [
                    {
                        name: 'Options:',
                        value: `${message}`
                    }
                ]
            },
            timestamp: (new Date()).toISOString()
        });
    }

    // removes a players vote if they disconnect from the sever
    clearVote() {
        const currentPlayers = this.server.players.map((p) => p.steamID);
        for (const steamID in this.trackedVotes) {
            if (!(currentPlayers.includes(steamID))) {
                const vote = this.trackedVotes[steamID];
                this.tallies[vote] -= 1;
                delete this.trackedVotes[steamID];
            }
        }
    }

    restorePersistentData() {
        this.verbose(1, `Restoring persistent data from: ${this.options.persistentDataFile}`)

        if (this.options.persistentDataFile === "") return;

        if (!fs.existsSync(this.options.persistentDataFile)) return;

        let bkData = fs.readFileSync(this.options.persistentDataFile);
        if (bkData === "") return;

        try {
            bkData = JSON.parse(bkData)
        } catch (e) {
            this.verbose(1, "Error restoring persistent data", e)
            return
        }
        if (bkData.manualRestartSender && bkData.manualRestartSender !== "") {
            (async () => {
                await this.warn(bkData.manualRestartSender, `SquadJS has completed the restart.\nPersistent data restored.`)
                this.verbose(1, `Restart confirmation sent to SteamID: "${bkData.manualRestartSender}"`)
            })()
        }

        for (const k in bkData.server) this.server[k] = bkData.server[k];

        const maxSecondsDiffierence = 60
        if ((new Date() - new Date(bkData.saveDateTime)) / 1000 > maxSecondsDiffierence) return

        this.verbose(1, "Restoring data:", bkData)

        // if (bkData.custom.layerHistory) this.server.layerHistory = Layers.layers.filter(l => bkData.custom.layerHistory.includes(l.layerid));
        this.verbose(1, "Recently played maps: " + this.server.layerHistory.filter((l) => l && l.map && l.map.name).map((l) => l.layer.map.name).join(', '))

        for (const k in bkData.plugin) this[k] = bkData.plugin[k];
        if (this.votingEnabled) {
            this.broadcastIntervalTask = setInterval(this.broadcastNominations, toMils(this.options.voteBroadcastInterval));
        }
    }


    savePersistentData(steamID = null) {
        if (this.options.persistentDataFile === "") return;

        const saveDt = {
            custom: {
                // layerHistory: this.server.layerHistory.slice(0, this.options.numberRecentMapsToExlude * 2).filter(l => l && l.layerid).map(l => l.layerid),
            },
            server: {
                layerHistory: this.server.layerHistory
            },
            plugin: {
                nominations: this.nominations,
                trackedVotes: this.trackedVotes,
                tallies: this.tallies,
                votingEnabled: this.votingEnabled,
                factionStrings: this.factionStrings,
                firstBroadcast: this.firstBroadcast
            },
            manualRestartSender: steamID,
            saveDateTime: new Date()
        }
        // this.verbose(1, `Saving persistent data to: ${this.options.persistentDataFile}\n`, saveDt.server.layerHistory)

        fs.writeFileSync(this.options.persistentDataFile, JSON.stringify(saveDt, null, 2))
    }

    // calculates the current winner(s) of the vote and returns thier strings in an array
    get currentWinners() {
        const ties = [];

        let highestScore = -Infinity;
        const allScoreZero = !this.tallies.find(s => s > 0);
        for (const choice in this.tallies) {
            const score = this.tallies[choice];
            if (score >= this.options.minimumVotesToAcceptResult || allScoreZero) {
                if (score < highestScore)
                    continue;
                else if (score > highestScore) {
                    highestScore = score;
                    ties.length = 0;
                    ties.push(choice);
                } else // equal
                    ties.push(choice);
            }
            this.verbose(1, 'Ties', ties, ties.map(i => this.nominations[i]))
        }

        return ties.map(i => this.nominations[i]);
    }

    formatChoice(choiceIndex, mapString, currentVotes, hideVoteCount) {
        return `${choiceIndex}➤ ${mapString} ` + (!hideVoteCount ? `(${currentVotes})` : "");
        // return `${choiceIndex + 1}❱ ${mapString} (${currentVotes} votes)`
    }
}

function randomElement(array) {
    return array[Math.floor(Math.random() * array.length)];
}

function toMils(min) {
    return min * 60 * 1000;
}
