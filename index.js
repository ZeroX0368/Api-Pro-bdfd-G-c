
const express = require('express');
const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());

// Validation middleware for headers
const validateHeaders = (req, res, next) => {
    const botToken = req.headers['x-bot-token'];
    const guildId = req.headers['x-guild-id'];
    
    if (!botToken) {
        return res.status(400).json({
            error: 'Missing bot token',
            detail: 'Please provide x-bot-token header'
        });
    }
    
    if (!guildId) {
        return res.status(400).json({
            error: 'Missing guild ID',
            detail: 'Please provide x-guild-id header'
        });
    }
    
    req.botToken = botToken;
    req.guildId = guildId;
    next();
};

// Health check endpoint
app.get('/', (req, res) => {
    res.json({ 
        status: 'Discord Bot API Server is running',
        endpoints: [
            'POST /addroleall - Add role to all guild members',
            'POST /roleremoveall - Remove role from all guild members',
            'POST /unbanall - Unban all users from the server'
        ]
    });
});

// Add role to all members endpoint
app.post('/addroleall', validateHeaders, async (req, res) => {
    try {
        const { roleId } = req.body;
        const { botToken, guildId } = req;
        
        if (!roleId) {
            return res.status(400).json({
                error: 'Missing roleId in request body',
                detail: 'Please provide a roleId to add to all users'
            });
        }
        
        // Create temporary client for this request
        const tempClient = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMembers
            ]
        });
        
        await tempClient.login(botToken);
        
        // Wait for client to be ready
        await new Promise((resolve) => {
            tempClient.once('ready', resolve);
        });
        
        const guild = await tempClient.guilds.fetch(guildId);
        
        if (!guild) {
            await tempClient.destroy();
            return res.status(404).json({
                error: 'Guild not found',
                detail: 'The specified guild ID could not be found'
            });
        }
        
        // Check bot permissions
        const botMember = await guild.members.fetch(tempClient.user.id);
        if (!botMember.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
            await tempClient.destroy();
            return res.status(403).json({
                error: 'Insufficient permissions',
                detail: 'Bot lacks MANAGE_ROLES permission'
            });
        }
        
        // Get the role
        const role = await guild.roles.fetch(roleId);
        if (!role) {
            await tempClient.destroy();
            return res.status(404).json({
                error: 'Role not found',
                detail: `Role with ID ${roleId} not found in the guild`
            });
        }
        
        // Check if bot can manage this role
        if (role.position >= botMember.roles.highest.position) {
            await tempClient.destroy();
            return res.status(403).json({
                error: 'Cannot manage role',
                detail: 'Bot role position is not high enough to manage this role'
            });
        }
        
        // Fetch all members
        const members = await guild.members.fetch();
        
        let successCount = 0;
        let skipCount = 0;
        let errorCount = 0;
        const errors = [];
        
        for (const [memberId, member] of members) {
            try {
                // Check if member already has the role
                if (member.roles.cache.has(roleId)) {
                    skipCount++;
                    continue;
                }
                
                // Add role to member (including bots)
                await member.roles.add(role);
                successCount++;
                
                // Add small delay to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, 100));
                
            } catch (error) {
                errorCount++;
                errors.push(`Failed to add role to ${member.user.username}: ${error.message}`);
            }
        }
        
        await tempClient.destroy();
        
        res.json({
            success: true,
            roleId: roleId,
            roleName: role.name,
            totalMembers: members.size,
            successCount: successCount,
            skipCount: skipCount,
            errorCount: errorCount,
            errors: errors.slice(0, 10), // Limit errors shown
            detail: `Added role "${role.name}" to ${successCount} users (including bots). Skipped ${skipCount} users (already had role). ${errorCount} errors occurred.`
        });
        
    } catch (error) {
        res.status(500).json({
            error: 'Internal server error',
            detail: error.message
        });
    }
});

// Remove role from all members endpoint
app.post('/roleremoveall', validateHeaders, async (req, res) => {
    try {
        const { roleId } = req.body;
        const { botToken, guildId } = req;
        
        if (!roleId) {
            return res.status(400).json({
                error: 'Missing roleId in request body',
                detail: 'Please provide a roleId to remove from all users'
            });
        }
        
        // Create temporary client for this request
        const tempClient = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMembers
            ]
        });
        
        await tempClient.login(botToken);
        
        // Wait for client to be ready
        await new Promise((resolve) => {
            tempClient.once('ready', resolve);
        });
        
        const guild = await tempClient.guilds.fetch(guildId);
        
        if (!guild) {
            await tempClient.destroy();
            return res.status(404).json({
                error: 'Guild not found',
                detail: 'The specified guild ID could not be found'
            });
        }
        
        // Check bot permissions
        const botMember = await guild.members.fetch(tempClient.user.id);
        if (!botMember.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
            await tempClient.destroy();
            return res.status(403).json({
                error: 'Insufficient permissions',
                detail: 'Bot lacks MANAGE_ROLES permission'
            });
        }
        
        // Get the role
        const role = await guild.roles.fetch(roleId);
        if (!role) {
            await tempClient.destroy();
            return res.status(404).json({
                error: 'Role not found',
                detail: `Role with ID ${roleId} not found in the guild`
            });
        }
        
        // Check if bot can manage this role
        if (role.position >= botMember.roles.highest.position) {
            await tempClient.destroy();
            return res.status(403).json({
                error: 'Cannot manage role',
                detail: 'Bot role position is not high enough to manage this role'
            });
        }
        
        // Fetch all members
        const members = await guild.members.fetch();
        
        let successCount = 0;
        let skipCount = 0;
        let errorCount = 0;
        const errors = [];
        
        for (const [memberId, member] of members) {
            try {
                // Check if member doesn't have the role
                if (!member.roles.cache.has(roleId)) {
                    skipCount++;
                    continue;
                }
                
                // Remove role from member (including bots)
                await member.roles.remove(role);
                successCount++;
                
                // Add small delay to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, 100));
                
            } catch (error) {
                errorCount++;
                errors.push(`Failed to remove role from ${member.user.username}: ${error.message}`);
            }
        }
        
        await tempClient.destroy();
        
        res.json({
            success: true,
            roleId: roleId,
            roleName: role.name,
            totalMembers: members.size,
            successCount: successCount,
            skipCount: skipCount,
            errorCount: errorCount,
            errors: errors.slice(0, 10), // Limit errors shown
            detail: `Removed role "${role.name}" from ${successCount} users (including bots). Skipped ${skipCount} users (didn't have role). ${errorCount} errors occurred.`
        });
        
    } catch (error) {
        res.status(500).json({
            error: 'Internal server error',
            detail: error.message
        });
    }
});

// Unban all users endpoint
app.post('/unbanall', validateHeaders, async (req, res) => {
    try {
        const { botToken, guildId } = req;
        
        // Create temporary client for this request
        const tempClient = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildBans
            ]
        });
        
        await tempClient.login(botToken);
        
        // Wait for client to be ready
        await new Promise((resolve) => {
            tempClient.once('ready', resolve);
        });
        
        const guild = await tempClient.guilds.fetch(guildId);
        
        if (!guild) {
            await tempClient.destroy();
            return res.status(404).json({
                error: 'Guild not found',
                detail: 'The specified guild ID could not be found'
            });
        }
        
        // Check bot permissions
        const botMember = await guild.members.fetch(tempClient.user.id);
        if (!botMember.permissions.has(PermissionsBitField.Flags.BanMembers)) {
            await tempClient.destroy();
            return res.status(403).json({
                error: 'Insufficient permissions',
                detail: 'Bot lacks BAN_MEMBERS permission'
            });
        }
        
        // Fetch all bans
        const bans = await guild.bans.fetch();
        
        if (bans.size === 0) {
            await tempClient.destroy();
            return res.json({
                success: true,
                totalBans: 0,
                successCount: 0,
                errorCount: 0,
                errors: [],
                detail: 'No banned users found in this server'
            });
        }
        
        let successCount = 0;
        let errorCount = 0;
        const errors = [];
        const unbannedUsers = [];
        
        for (const [userId, ban] of bans) {
            try {
                await guild.members.unban(userId, 'Bulk unban via API');
                successCount++;
                unbannedUsers.push({
                    id: userId,
                    username: ban.user.username,
                    tag: ban.user.tag
                });
                
                // Add small delay to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, 500));
                
            } catch (error) {
                errorCount++;
                errors.push(`Failed to unban ${ban.user.username}: ${error.message}`);
            }
        }
        
        await tempClient.destroy();
        
        res.json({
            success: true,
            totalBans: bans.size,
            successCount: successCount,
            errorCount: errorCount,
            errors: errors.slice(0, 10), // Limit errors shown
            unbannedUsers: unbannedUsers.slice(0, 20), // Limit users shown in response
            detail: `Successfully unbanned ${successCount} out of ${bans.size} banned users. ${errorCount} errors occurred.`
        });
        
    } catch (error) {
        res.status(500).json({
            error: 'Internal server error',
            detail: error.message
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        error: 'Something went wrong!',
        detail: err.message
    });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Discord bot API server running on port ${PORT}`);
    console.log(`Access it at: http://localhost:${PORT}`);
});
