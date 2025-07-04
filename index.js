import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  Events,
  SlashCommandBuilder,
  Routes,
} from "discord.js";
import { REST } from "@discordjs/rest";
import discordPlayer from "discord-player";
const { Player, RepeatMode } = discordPlayer;
import { DefaultExtractors } from "@discord-player/extractor";
import playdl from "play-dl";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const player = new Player(client);
await player.extractors.loadMulti(DefaultExtractors);

const commands = [
  new SlashCommandBuilder()
    .setName("play")
    .setDescription("播放歌曲")
    .addStringOption(option =>
      option.setName("query").setDescription("歌曲名稱或連結").setRequired(true)
    ),
  new SlashCommandBuilder().setName("skip").setDescription("跳過目前歌曲"),
  new SlashCommandBuilder().setName("stop").setDescription("停止播放並清除播放列表"),
  new SlashCommandBuilder().setName("pause").setDescription("暫停播放"),
  new SlashCommandBuilder().setName("resume").setDescription("恢復播放"),
  new SlashCommandBuilder().setName("queue").setDescription("顯示播放列表"),
  new SlashCommandBuilder()
    .setName("volume")
    .setDescription("設定音量 (1~100)")
    .addIntegerOption(option =>
      option.setName("level").setDescription("音量大小").setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("loop")
    .setDescription("設定循環播放模式")
    .addStringOption(option =>
      option
        .setName("mode")
        .setDescription("循環模式")
        .setRequired(true)
        .addChoices(
          { name: "關閉", value: "off" },
          { name: "單曲", value: "track" },
          { name: "整個播放列表", value: "queue" }
        )
    ),
];

client.searchResults = new Map();

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);
  try {
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID),
      { body: commands.map(cmd => cmd.toJSON()) }
    );
    console.log("✅ Slash commands 註冊完成！");
  } catch (error) {
    console.error("❌ 註冊 slash commands 出錯：", error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (!interaction.isChatInputCommand() && !interaction.isStringSelectMenu()) return;

    // 選單選擇歌曲
    if (
      interaction.isStringSelectMenu() &&
      interaction.customId.startsWith("select_track_") &&
      interaction.user.id === interaction.customId.replace("select_track_", "")
    ) {
      await interaction.deferUpdate();

      const userId = interaction.user.id;
      const stored = client.searchResults.get(userId);
      if (!stored)
        return interaction.followUp({ content: "找不到對應的搜尋結果", ephemeral: true });

      const { results } = stored;
      const selectedIndex = parseInt(interaction.values[0], 10);
      const track = results.tracks[selectedIndex];
      if (!track)
        return interaction.followUp({ content: "選擇無效", ephemeral: true });

      let queue = player.nodes.get(interaction.guild.id);
      if (!queue) {
        queue = player.nodes.create(interaction.guild, { metadata: interaction.channel });
        const channel = interaction.member.voice.channel;
        if (!channel)
          return interaction.followUp({ content: "請先加入語音頻道", ephemeral: true });
        await queue.connect(channel);
      }

      track.requestedBy = interaction.user;
      queue.addTrack(track);
      if (!queue.isPlaying() && !queue.node.isPaused()) {
        await queue.node.play();
      }

      await interaction.followUp({
        content: `🎵 播放：${track.title}（由 ${track.requestedBy.tag} 點播）`,
        ephemeral: true,
      });

      client.searchResults.delete(userId);
      try {
        await interaction.editReply({ content: `已選擇：${track.title}`, components: [] });
      } catch {}
      return;
    }

    // /play 指令
    if (interaction.commandName === "play") {
      const query = interaction.options.getString("query");
      const channel = interaction.member.voice.channel;
      if (!channel)
        return interaction.reply({ content: "請先加入語音頻道", ephemeral: true });

      await interaction.deferReply({ ephemeral: true });

      try {
        if (playdl.yt_validate(query) === "video") {
          const videoInfo = await playdl.video_info(query);
          const track = await player.createTrack({
            title: videoInfo.video_details.title,
            url: videoInfo.video_details.url,
            duration: videoInfo.video_details.durationInSec,
            author: videoInfo.video_details.channel.name,
            thumbnail: videoInfo.video_details.thumbnails[0]?.url,
            requestedBy: interaction.user,
            source: "youtube",
          });

          let queue = player.nodes.get(interaction.guild.id);
          if (!queue) {
            queue = player.nodes.create(interaction.guild, { metadata: interaction.channel });
            await queue.connect(channel);
          }

          queue.addTrack(track);
          if (!queue.isPlaying() && !queue.node.isPaused()) {
            await queue.node.play();
          }

          return await interaction.editReply({
            content: `🎵 播放：${track.title}（由 ${interaction.user.tag} 點播）`,
          });
        }

        // 搜尋處理
        const results = await player.search(query, {
          requestedBy: interaction.user,
          limit: 5,
        });

        if (!results.hasTracks())
          return await interaction.editReply({ content: "❌ 找不到音樂" });

        const options = results.tracks.map((track, index) => ({
          label: track.title.slice(0, 100),
          description: track.author.slice(0, 100),
          value: String(index),
        }));

        const row = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`select_track_${interaction.user.id}`)
            .setPlaceholder("請選擇要播放的歌曲")
            .addOptions(options)
        );

        await interaction.editReply({
          content: "請從下方選單中選擇要播放的歌曲（30秒內有效）",
          components: [row],
        });

        client.searchResults.set(interaction.user.id, { results });

        setTimeout(async () => {
          if (!client.searchResults.has(interaction.user.id)) return;
          client.searchResults.delete(interaction.user.id);
          try {
            await interaction.editReply({
              content: "選擇時間已過，請重新輸入指令。",
              components: [],
            });
          } catch {}
        }, 30000);
      } catch (err) {
        console.error(err);
        await interaction.editReply({ content: "❌ 播放出錯" });
      }
    }

    else if (interaction.commandName === "skip") {
      const queue = player.nodes.get(interaction.guild.id);
      if (!queue || !queue.isPlaying())
        return interaction.reply({ content: "目前沒有播放中的音樂", ephemeral: true });

      await queue.node.skip();
      await interaction.reply({ content: "⏭ 已跳過目前歌曲", ephemeral: true });
    }

    else if (interaction.commandName === "stop") {
      const queue = player.nodes.get(interaction.guild.id);
      if (!queue)
        return interaction.reply({ content: "目前沒有播放中的音樂", ephemeral: true });

      queue.delete();
      await interaction.reply({ content: "⏹ 已停止播放並清除播放列表", ephemeral: true });
    }

    else if (interaction.commandName === "pause") {
      const queue = player.nodes.get(interaction.guild.id);
      if (!queue || !queue.isPlaying())
        return interaction.reply({ content: "目前沒有播放中的音樂", ephemeral: true });

      queue.node.pause();
      await interaction.reply({ content: "⏸ 已暫停播放", ephemeral: true });
    }

    else if (interaction.commandName === "resume") {
      const queue = player.nodes.get(interaction.guild.id);
      if (!queue || !queue.node.isPaused())
        return interaction.reply({ content: "目前沒有暫停的音樂", ephemeral: true });

      queue.node.resume();
      await interaction.reply({ content: "▶️ 已恢復播放", ephemeral: true });
    }

    else if (interaction.commandName === "queue") {
      const queue = player.nodes.get(interaction.guild.id);
      if (!queue || (!queue.isPlaying() && queue.tracks.size === 0))
        return interaction.reply({ content: "目前播放列表是空的", ephemeral: true });

      const currentTrack = queue.currentTrack;
      const tracks = queue.tracks.toArray().slice(0, 10);

      let list = "";
      if (currentTrack) {
        list += `▶️ 正在播放：${currentTrack.title}（由 ${currentTrack.requestedBy?.tag || "未知"} 點播）\n\n`;
      }
      if (tracks.length > 0) {
        list += `🎶 播放列表（最多顯示10首）:\n`;
        list += tracks.map((track, i) => `${i + 1}. ${track.title}（由 ${track.requestedBy?.tag || "未知"} 點播）`).join("\n");
      }

      await interaction.reply({ content: list, ephemeral: true });
    }

    else if (interaction.commandName === "volume") {
      const queue = player.nodes.get(interaction.guild.id);
      if (!queue || !queue.isPlaying())
        return interaction.reply({ content: "目前沒有播放中的音樂", ephemeral: true });

      const volume = interaction.options.getInteger("level");
      if (!volume || volume < 1 || volume > 100)
        return interaction.reply({ content: "請輸入 1~100 的數字", ephemeral: true });

      queue.node.setVolume(volume);
      await interaction.reply({ content: `🔊 音量設定為 ${volume}%`, ephemeral: true });
    }

    else if (interaction.commandName === "loop") {
      const queue = player.nodes.get(interaction.guild.id);
      if (!queue || !queue.currentTrack)
        return interaction.reply({ content: "目前沒有播放中的音樂", ephemeral: true });

      const mode = interaction.options.getString("mode");
      let repeatMode = RepeatMode.OFF;
      if (mode === "track") repeatMode = RepeatMode.TRACK;
      else if (mode === "queue") repeatMode = RepeatMode.QUEUE;

      queue.setRepeatMode(repeatMode);

      const modeText =
        mode === "track" ? "單曲循環" : mode === "queue" ? "整個播放列表" : "關閉循環";
      await interaction.reply({ content: `🔁 已設定為 ${modeText}`, ephemeral: true });
    }
  } catch (error) {
    console.error("整體互動錯誤:", error);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: "❌ 指令處理失敗" });
    } else {
      await interaction.reply({ content: "❌ 指令處理失敗", ephemeral: true });
    }
  }
});

client.login(process.env.TOKEN);
