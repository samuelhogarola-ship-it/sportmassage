<?php
/**
 * Plugin Name: Website Umami Analytics
 * Description: Loads the site's cookieless Umami analytics on public pages.
 */
if (!defined('ABSPATH')) {
    exit;
}
add_action('wp_head', function () {
    if (is_admin()) {
        return;
    }
    echo '<script defer src="/umami-analytics.js"></script>' . "\n";
});
