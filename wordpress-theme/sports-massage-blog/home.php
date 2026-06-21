<?php
if (!defined('ABSPATH')) {
    exit;
}

get_header();
?>
<section class="hero">
    <div class="hero-inner">
        <p class="eyebrow"><?php esc_html_e('Sport Massage in Fuengirola', 'sports-massage-blog'); ?></p>
        <h1 class="hero-title"><?php esc_html_e('Blog', 'sports-massage-blog'); ?></h1>
        <p class="hero-summary"><?php esc_html_e('Articles on massage, recovery and wellbeing with the same visual language as the main website.', 'sports-massage-blog'); ?></p>
    </div>
</section>

<main class="content-grid">
    <div class="content-main">
        <?php if (is_home() && get_option('page_for_posts')) : ?>
            <div class="entry-card entry-card-intro">
                <h2 class="entry-title"><?php esc_html_e('Content aligned with the brand', 'sports-massage-blog'); ?></h2>
                <p><?php esc_html_e('Useful articles for publishing advice, guides and content that build trust around the practice.', 'sports-massage-blog'); ?></p>
            </div>
        <?php endif; ?>
        <?php if (have_posts()) : ?>
            <?php while (have_posts()) : the_post(); ?>
                <article <?php post_class('entry-card'); ?>>
                    <div class="post-meta"><?php echo esc_html(get_the_date()); ?></div>
                    <h2 class="entry-title"><a href="<?php the_permalink(); ?>"><?php the_title(); ?></a></h2>
                    <div class="entry-summary"><?php the_excerpt(); ?></div>
                </article>
            <?php endwhile; ?>
            <div class="entry-card"><?php the_posts_pagination(); ?></div>
        <?php else : ?>
            <article class="entry-card">
                <h2 class="entry-title"><?php esc_html_e('Todavía no hay artículos', 'sports-massage-blog'); ?></h2>
                <p><?php esc_html_e('Publica tu primera entrada y aparecerá aquí.', 'sports-massage-blog'); ?></p>
            </article>
        <?php endif; ?>
    </div>
    <aside class="content-sidebar">
        <?php get_sidebar(); ?>
    </aside>
</main>
<?php
get_footer();
