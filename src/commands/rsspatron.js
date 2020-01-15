const config = require('../config.js')
const log = require('../util/logger.js')
const GuildProfile = require('../structs/db/GuildProfile.js')
const Supporter = require('../structs/db/Supporter.js')
const helpText = profile => `Proper usage:

\`${profile ? (profile.prefix || config.bot.prefix) : config.bot.prefix}rsspatron servers add <server id>\` - Add your patron backing to a server via server ID or \`this\` for this server
\`${profile ? (profile.prefix || config.bot.prefix) : config.bot.prefix}rsspatron servers remove <server id>\` - Remove your patron backing from a server via server ID or \`this\` for this server
\`${profile ? (profile.prefix || config.bot.prefix) : config.bot.prefix}rsspatron servers list\` - List servers under your patron backing, and the maximum number of servers you may have
`

async function verifyServer (bot, serverId) {
  const results = (await bot.shard.broadcastEval(`
    const guild = this.guilds.get('${serverId}')
    guild ? { name: guild.name, id: guild.id } : null
  `)).filter(item => item)

  if (results.length > 0) return results[0]
}

/**
 * @param {import('discord.js').Client} bot
 * @param {import('discord.js').Message} message
 * @param {string[]} args
 * @param {Supporter} supporter
 * @param {string[]} supportedGuilds
 * @param {GuildProfile} profile
 */
async function switchServerArg (bot, message, args, supporter, supportedGuilds, profile) {
  try {
    const maxServers = await supporter.getMaxGuilds()
    const action = args.shift() // Third arg
    if (!action) return await message.channel.send('You must specify either `add` or `remove` as your third argument.')
    let server = args.shift() // Fourth arg
    if (action !== 'list' && !server) return await message.channel.send('You must specify the server ID, or `this` (to specify this server) as your fourth argument..')
    if (server === 'this') server = message.guild.id

    if (action === 'add') {
      if (supporter.guilds.length >= maxServers) {
        return await message.channel.send(`You cannot add any more servers for your patron status. Your maximum is ${maxServers}.`)
      }
      if (supporter.guilds.includes(server)) {
        return await message.channel.send(`That server already has your patron backing.`)
      }
      if (supportedGuilds.includes(server)) {
        return await message.channel.send(`This server is already supported by another patron.`)
      }
      const m = await message.channel.send(`Adding server ${server}...`)
      const gotGuild = await verifyServer(bot, server)
      if (!gotGuild) {
        return await m.edit(`Unable to add server \`${server}\`. Either it does not exist, or I am not in it.`)
      }
      supporter.guilds.push(server)
      await supporter.save()
      await m.edit(`Successfully added ${server} (${gotGuild.name})`)
    } else if (action === 'remove') {
      if (!supporter.guilds.includes(server)) {
        return await message.channel.send(`That server does not have your patron backing.`)
      }
      const m2 = await message.channel.send(`Removing server ${server}...`)
      supporter.guilds.splice(supporter.guilds.indexOf(server), 1)
      await supporter.save()
      await m2.edit(`Successfully removed`)
    } else if (action === 'list') {
      if (supporter.guilds.length === 0) {
        return await message.channel.send(`You have no servers under your patron backing. The maximum number of servers you may have under your patron backing is ${maxServers}.`)
      }
      const myGuilds = supporter.guilds
      let content = `The maximum number of servers you may add your patron backing to is ${maxServers}. The following guilds are backed by your patron status:\n\n`
      for (const id of myGuilds) {
        const gotGuild = await verifyServer(bot, id)
        content += gotGuild ? `${gotGuild.id} (${gotGuild.name})\n` : `${id} (Unknown)\n`
      }

      await message.channel.send(content)
    } else {
      await message.channel.send(`Invalid command usage. ${helpText(profile)}`)
    }
  } catch (err) {
    log.command.warning('rsspatron servers', message.guild, err, true)
    if (err.code !== 50013) message.channel.send(err.message).catch(err => log.command.warning('rsspatron servers', message.guild, err))
  }
}

module.exports = async (bot, message) => {
  try {
    const [ profile, supporter, supportedGuilds ] = await Promise.all([
      GuildProfile.get(message.guild.id),
      Supporter.get(message.author.id),
      Supporter.getValidGuilds()
    ])

    if (!supporter || !(await supporter.isValid())) {
      return await message.channel.send('You must be a patron to use this command.')
    }
    const args = message.content.toLowerCase().split(' ').map(item => item.trim())
    args.shift() // Remove prefix
    if (args.length === 0) {
      return await message.channel.send(helpText(profile))
    }
    const type = args.shift() // Second arg
    if (type === 'servers') {
      switchServerArg(bot, message, args, supporter, supportedGuilds, profile)
    } else {
      await message.channel.send(`Invalid command usage. ${helpText(profile)}`)
    }
    // switch (type) {
    //   case 'servers':

    //     break
    // case 'refresh':
    //   if (timeLimited[message.author.id]) {
    //     log.command.warning('Blocked refresh due to time limit', message.author)
    //     return await message.channel.send(`${message.author.toString()} Please wait 5 minutes after the last use of this command before using it again.`)
    //   }
    //   timeLimited[message.author.id] = true
    //   setTimeout(() => delete timeLimited[message.author.id], 300000) // 5 minutes
    //   const m = await message.channel.send('Refreshing...')
    //   dbOpsVips.refresh(async err => {
    //     try {
    //       if (err) {
    //         log.command.error('Failed to update VIPs', message.author, err)
    //         return await m.edit(`Failed to refresh patrons: ` + err.message)
    //       }
    //       log.command.success(`Refreshed VIPs`, message.author)
    //       await m.edit(`Successfully updated patrons.`)
    //     } catch (err) {
    //       log.command.warning('rsspatron 2', err, message.author)
    //     }
    //   })
    //   break
    // default:
    //   await message.channel.send('Invalid command usage')
    // }
  } catch (err) {
    log.command.warning('rsspatron', err, message.author)
    if (err.code !== 50013) message.channel.send(err.message).catch(err => log.command.warning('rsspatron 1', message.guild, err))
  }
}
