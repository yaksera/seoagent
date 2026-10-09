<?php
/**
 * Plugin Name: SEO Agent Connector
 * Description: Lets SEO Agent publish approved title and meta description fixes, with rollback. Works with Yoast SEO, Rank Math, SEOPress, or on its own.
 * Version: 1.0.0
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * License: GPLv2 or later
 * Text Domain: seo-agent-connector
 */

if (!defined('ABSPATH')) {
    exit;
}

const SEO_AGENT_VERSION = '1.0.0';
const SEO_AGENT_OPTION_SECRET = 'seo_agent_secret';
const SEO_AGENT_META_TITLE = '_seo_agent_title';
const SEO_AGENT_META_DESC = '_seo_agent_description';

register_activation_hook(__FILE__, function () {
    if (!get_option(SEO_AGENT_OPTION_SECRET)) {
        add_option(SEO_AGENT_OPTION_SECRET, wp_generate_password(48, false, false), '', false);
    }
});

/** Which SEO plugin stores the title/description. */
function seo_agent_provider(): string {
    if (defined('WPSEO_VERSION')) return 'yoast';
    if (class_exists('RankMath')) return 'rankmath';
    if (defined('SEOPRESS_VERSION')) return 'seopress';
    return 'own';
}

function seo_agent_keys(): array {
    switch (seo_agent_provider()) {
        case 'yoast':    return ['_yoast_wpseo_title', '_yoast_wpseo_metadesc'];
        case 'rankmath': return ['rank_math_title', 'rank_math_description'];
        case 'seopress': return ['_seopress_titles_title', '_seopress_titles_desc'];
        default:         return [SEO_AGENT_META_TITLE, SEO_AGENT_META_DESC];
    }
}

/** Every request must be from an admin (Application Password) AND carry a valid HMAC signature. */
function seo_agent_authorize(WP_REST_Request $request) {
    if (!current_user_can('manage_options')) {
        return new WP_Error('seo_agent_forbidden', 'Administrator access required.', ['status' => 403]);
    }
    $secret = get_option(SEO_AGENT_OPTION_SECRET);
    $timestamp = (int) $request->get_header('x_seo_agent_timestamp');
    $signature = (string) $request->get_header('x_seo_agent_signature');
    if (!$secret || !$timestamp || abs(time() - $timestamp) > 300) {
        return new WP_Error('seo_agent_stale', 'Missing or expired signature.', ['status' => 403]);
    }
    $expected = hash_hmac('sha256', $timestamp . '.' . $request->get_body(), $secret);
    if (!hash_equals($expected, $signature)) {
        return new WP_Error('seo_agent_signature', 'Invalid signature.', ['status' => 403]);
    }
    return true;
}

function seo_agent_read(int $post_id): array {
    [$tk, $dk] = seo_agent_keys();
    return [
        'title'       => (string) get_post_meta($post_id, $tk, true),
        'description' => (string) get_post_meta($post_id, $dk, true),
    ];
}

add_action('rest_api_init', function () {
    $ns = 'seo-agent/v1';

    register_rest_route($ns, '/info', [
        'methods'             => 'POST',
        'permission_callback' => 'seo_agent_authorize',
        'callback'            => function () {
            return [
                'plugin'    => SEO_AGENT_VERSION,
                'wordpress' => get_bloginfo('version'),
                'provider'  => seo_agent_provider(),
                'home'      => home_url('/'),
            ];
        },
    ]);

    // URL → post ID. The front page resolves to its page ID when one is set.
    register_rest_route($ns, '/resolve', [
        'methods'             => 'POST',
        'permission_callback' => 'seo_agent_authorize',
        'callback'            => function (WP_REST_Request $r) {
            $url = esc_url_raw((string) $r->get_param('url'));
            $id = url_to_postid($url);
            if (!$id && untrailingslashit($url) === untrailingslashit(home_url('/'))) {
                $id = (int) get_option('page_on_front');
            }
            if (!$id) {
                return new WP_Error('seo_agent_not_found', 'This URL is not a post or page (archives and the blog home are not supported yet).', ['status' => 404]);
            }
            return ['post_id' => $id, 'type' => get_post_type($id), 'current' => seo_agent_read($id)];
        },
    ]);

    // Write title/description. "expected" must match the current values, otherwise
    // someone edited them since we looked, and we refuse instead of overwriting.
    register_rest_route($ns, '/seo', [
        'methods'             => 'POST',
        'permission_callback' => 'seo_agent_authorize',
        'callback'            => function (WP_REST_Request $r) {
            $id = (int) $r->get_param('post_id');
            if (!$id || !get_post($id)) {
                return new WP_Error('seo_agent_not_found', 'Post not found.', ['status' => 404]);
            }
            $current = seo_agent_read($id);
            $expected = (array) $r->get_param('expected');
            foreach (['title', 'description'] as $field) {
                if (array_key_exists($field, $expected) && (string) $expected[$field] !== $current[$field]) {
                    return new WP_Error('seo_agent_conflict', 'The value changed since it was read.', ['status' => 409, 'current' => $current]);
                }
            }
            [$tk, $dk] = seo_agent_keys();
            $set = (array) $r->get_param('set');
            if (array_key_exists('title', $set)) {
                update_post_meta($id, $tk, sanitize_text_field((string) $set['title']));
            }
            if (array_key_exists('description', $set)) {
                update_post_meta($id, $dk, sanitize_textarea_field((string) $set['description']));
            }
            clean_post_cache($id);
            return ['previous' => $current, 'current' => seo_agent_read($id)];
        },
    ]);
});

// Output for sites without an SEO plugin.
add_filter('pre_get_document_title', function ($title) {
    if (seo_agent_provider() !== 'own' || !is_singular()) return $title;
    $own = get_post_meta(get_queried_object_id(), SEO_AGENT_META_TITLE, true);
    return $own !== '' ? $own : $title;
}, 20);

add_action('wp_head', function () {
    if (seo_agent_provider() !== 'own' || !is_singular()) return;
    $desc = get_post_meta(get_queried_object_id(), SEO_AGENT_META_DESC, true);
    if ($desc !== '') {
        echo '<meta name="description" content="' . esc_attr($desc) . "\" />\n";
    }
}, 1);

// Settings page showing the connection key.
add_action('admin_menu', function () {
    add_options_page('SEO Agent', 'SEO Agent', 'manage_options', 'seo-agent', function () {
        if (!current_user_can('manage_options')) return;
        if (isset($_POST['seo_agent_rotate']) && check_admin_referer('seo_agent_rotate')) {
            update_option(SEO_AGENT_OPTION_SECRET, wp_generate_password(48, false, false), false);
            echo '<div class="notice notice-success"><p>New connection key created. Reconnect in SEO Agent.</p></div>';
        }
        $secret = get_option(SEO_AGENT_OPTION_SECRET);
        ?>
        <div class="wrap">
            <h1>SEO Agent</h1>
            <p>Detected SEO plugin: <strong><?php echo esc_html(seo_agent_provider()); ?></strong></p>
            <h2>Connect</h2>
            <ol>
                <li>Create an Application Password: <em>Users → Profile → Application Passwords</em>, name it "SEO Agent".</li>
                <li>In SEO Agent, open your site → Connect WordPress, and enter your username, that Application Password, and the connection key below.</li>
            </ol>
            <p><label for="seo-agent-key"><strong>Connection key</strong></label><br>
                <input id="seo-agent-key" type="text" class="large-text code" readonly value="<?php echo esc_attr($secret); ?>" onclick="this.select()"></p>
            <form method="post">
                <?php wp_nonce_field('seo_agent_rotate'); ?>
                <p><button class="button" name="seo_agent_rotate" value="1">Create a new key (disconnects SEO Agent)</button></p>
            </form>
            <p>Uninstalling this plugin keeps titles and descriptions already saved in your SEO plugin.</p>
        </div>
        <?php
    });
});
